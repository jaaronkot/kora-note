// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package model

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/88250/gulu"
	"github.com/88250/lute/html"
	"github.com/siyuan-community/siyuan/kernel/cache"
	"github.com/siyuan-community/siyuan/kernel/conf"
	"github.com/siyuan-community/siyuan/kernel/filesys"
	"github.com/siyuan-community/siyuan/kernel/sql"
	"github.com/siyuan-community/siyuan/kernel/treenode"
	"github.com/siyuan-community/siyuan/kernel/util"
	"github.com/siyuan-note/dejavu"
	"github.com/siyuan-note/dejavu/cloud"
	"github.com/siyuan-note/logging"
)

// publishSyncResult persists the completed outcome before publishing it to every frontend.
func publishSyncResult(code int, syncErr error) {
	UpdateSyncConf(func(s *conf.Sync) {
		s.LastResult = code
		if syncErr != nil {
			s.Stat = formatSyncRepoErrorMsg(syncErr)
		}
	})
	util.BroadcastByType("main", "syncing", code, Conf.Sync.Load().Stat, nil)
}

func SyncDataDownload(decisions ...SyncSourceDecision) (err error) {
	err = errors.New("sync download did not complete")
	defer logging.Recover()

	if !checkSync(false, false, true) {
		return
	}

	unlock, ok := lockSyncRequest(&syncDownloadRequests)
	if !ok {
		return
	}
	defer unlock()
	err = syncDataDownloadLocked(decisions...)
	return
}

func syncDataDownloadLocked(decisions ...SyncSourceDecision) (err error) {
	util.BroadcastByType("main", "syncing", 0, Conf.Language(81), nil)

	now := util.CurrentTimeMillis()
	UpdateSyncConf(func(s *conf.Sync) { s.Synced = now })

	err = syncRepoDownloadWithDNSRetry(decisions...)
	code := 1
	if err != nil {
		code = 2
	}
	publishSyncResult(code, err)
	// Download-only completion does not publish local changes, including an empty remote.
	// Keep the pending hint until an upload or full sync actually publishes them.
	if 1 == code {
		consumeShorthands()
	}
	return
}

func completeCurrentSyncRemoteRequest(scope string) {
	// 完整同步可能在合并本地变更后生成新的最新索引，同时记录实际结果可覆盖两类通知到达顺序相反的情况。
	repo, err := newRepository()
	if nil != err {
		logging.LogWarnf("create repo after remote sync failed: %s", err)
		return
	}
	latest, err := repo.Latest()
	if nil != err {
		logging.LogWarnf("get local latest after remote sync failed: %s", err)
		return
	}
	syncRemoteRequests.complete(scope, latest.ID)
}

func SyncDataUpload(decisions ...SyncSourceDecision) (err error) {
	err = errors.New("sync upload did not complete")
	defer logging.Recover()

	if !checkSync(false, false, true) {
		return
	}

	unlock, ok := lockSyncRequest(&syncUploadRequests)
	if !ok {
		return
	}
	defer unlock()
	revision := pendingSync.begin()
	util.BroadcastByType("main", "syncing", 0, Conf.Language(81), nil)

	now := util.CurrentTimeMillis()
	UpdateSyncConf(func(s *conf.Sync) { s.Synced = now })

	err = syncRepoUploadWithDNSRetry(decisions...)
	code := 1
	if err != nil {
		code = 2
	}
	publishSyncResult(code, err)
	pendingSync.finish(revision, err == nil, notifySyncPending)
	return
}

var (
	pendingSync      syncPendingState
	syncSameCount    = atomic.Int32{}
	autoSyncErrCount = atomic.Int32{}
	fixSyncInterval  = 5 * time.Minute

	syncPlanTimeLock = sync.Mutex{}
	syncPlanTime     = time.Now().Add(fixSyncInterval)

	BootSyncSucc atomic.Int32 // -1：未执行，0：执行成功，1：执行失败
)

func init() {
	BootSyncSucc.Store(-1)
}

func SyncDataJob() {
	syncPlanTimeLock.Lock()
	if time.Now().Before(syncPlanTime) {
		syncPlanTimeLock.Unlock()
		return
	}
	syncPlanTimeLock.Unlock()

	SyncData(false)
}

func BootSyncData() {
	defer logging.Recover()
	if err := prepareDocumentSourceBootSync(); err != nil {
		if util.IsBooted() {
			logging.LogErrorf("prepare recovered document sources before sync failed: %s", err)
		} else {
			logging.LogFatalf(logging.ExitCodeFileSysErr, "prepare recovered document sources before sync failed: %s", err)
		}
		return
	}
	if scheduleBootSync() {
		return
	}
	bootSyncData()
}

func bootSyncData() {
	refreshLANSyncManager()

	if !checkSync(true, false, false) {
		return
	}

	lockSync()
	defer unlockSync()
	if !checkSync(true, false, false) {
		return
	}

	afterBoot := util.IsBooted()
	if !afterBoot {
		util.IncBootProgress(3, Conf.Language(307))
	}
	BootSyncSucc.Store(-1)
	if afterBoot {
		logging.LogInfof("sync after boot")
	} else {
		logging.LogInfof("sync before boot")
	}

	now := util.CurrentTimeMillis()
	UpdateSyncConf(func(s *conf.Sync) { s.Synced = now })
	revision := pendingSync.begin()
	if afterBoot {
		// 本地界面已可编辑，保持同步入口可见直到云端合并成功。
		notifySyncPending(true)
	}
	util.BroadcastByType("main", "syncing", 0, Conf.Language(81), nil)
	var cloudPublished bool
	var err error
	if afterBoot {
		cloudPublished, err = syncRepoWithDNSRetry(false, false)
	} else {
		var scheduled bool
		scheduled, err = bootSyncRepoWithDNSRetry(func(err error) {
			finishBootSync(revision, false, err)
		})
		if scheduled {
			return
		}
	}
	finishBootSync(revision, cloudPublished, err)
}

func finishBootSync(revision uint64, cloudPublished bool, err error) {
	code := 1
	if err != nil {
		code = 2
		BootSyncSucc.Store(1)
		if util.IsBooted() && !errors.Is(err, context.Canceled) && !errors.Is(err, errSyncRemoteRequestSkipped) {
			msg := formatSyncRepoErrorMsg(err)
			UpdateSyncConf(func(s *conf.Sync) { s.Stat = msg })
			pushSyncStatusBar(msg)
			util.PushErrMsg(msg, 0)
		}
	} else {
		BootSyncSucc.Store(0)
	}
	publishSyncResult(code, err)
	pendingSync.finish(revision, err == nil, notifySyncPending)
	if 1 == code {
		// 启动同步成功后消费本地速记临时文件，避免移动端开启云同步时需手动触发同步才能刷新闪念速记
		consumeShorthands()
	}
}

func SyncData(byHand bool) error {
	return syncData(false, byHand)
}

// SyncDataBeforeEnableEncryptedNotebook 在启用加密笔记本前执行一次完整同步。
// 未启用数据同步时直接返回；已启用数据同步时，任何同步失败都会阻止继续创建新的密钥体系。
func SyncDataBeforeEnableEncryptedNotebook() error {
	confSyncSnapshot := Conf.LoadSync()

	if !confSyncSnapshot.Enabled {
		return nil
	}
	if !cloud.IsValidCloudDirName(confSyncSnapshot.CloudName) {
		return errors.New(Conf.Language(123))
	}
	if !checkSync(false, false, true) {
		return errors.New(Conf.Language(53))
	}

	// 不复用请求合并状态，确保调用返回前确实完成了一次由当前启用操作发起的完整同步。
	lockSync()
	defer unlockSync()
	if err := syncDataLocked(false, true); err != nil {
		if confSyncSnapshot.Stat != "" {
			return errors.New(confSyncSnapshot.Stat)
		}
		return err
	}
	return nil
}

func lockSync() {
	syncLock.Lock()
	isSyncing.Store(true)
}

func unlockSync() {
	isSyncing.Store(false)
	syncLock.Unlock()
}

type syncRequestState struct {
	requested atomic.Uint64
	completed atomic.Uint64
}

func lockSyncRequest(state *syncRequestState) (unlock func(), ok bool) {
	request := state.requested.Add(1)
	lockSync()
	if util.IsExiting.Load() {
		unlockSync()
		return nil, false
	}
	if state.completed.Load() >= request {
		unlockSync()
		return nil, false
	}

	runRequests := state.requested.Load()
	unlock = func() {
		state.completed.Store(runRequests)
		unlockSync()
	}
	return unlock, true
}

func syncData(exit, byHand bool) (err error) {
	err = errors.New("sync did not complete")
	defer logging.Recover()

	if !checkSync(false, exit, byHand) {
		if byHand {
			return err
		}
		return nil
	}

	requests := &syncAutoRequests
	if byHand {
		requests = &syncManualRequests
	} else if exit {
		requests = &syncExitRequests
	}
	unlock, ok := lockSyncRequest(requests)
	if !ok {
		if byHand {
			return err
		}
		return nil
	}
	defer unlock()
	return syncDataLocked(exit, byHand)
}

func syncDataLocked(exit, byHand bool) error {
	return syncDataLockedContext(context.Background(), exit, byHand)
}

func syncDataLockedContext(ctx context.Context, exit, byHand bool) (err error) {
	err = errors.New("sync did not complete")
	defer logging.Recover()
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := checkDataImportRecovery(); err != nil {
		return err
	}
	revision := pendingSync.begin()
	util.BroadcastByType("main", "syncing", 0, Conf.Language(81), nil)
	if exit {
		logging.LogInfof("sync before exit")
		msgId := util.PushMsg(Conf.Language(81), 1000*60*15)
		defer func() {
			util.PushClearMsg(msgId)
		}()
	}

	now := util.CurrentTimeMillis()
	UpdateSyncConf(func(s *conf.Sync) { s.Synced = now })

	_, err = syncRepoWithDNSRetryContext(ctx, exit, byHand)
	code := 1
	if err != nil {
		code = 2
	} else {
		BootSyncSucc.Store(0)
	}
	publishSyncResult(code, err)
	pendingSync.finish(revision, err == nil, notifySyncPending)

	if !exit && 1 == code {
		consumeShorthands()
	}

	return err
}

func checkSync(boot, exit, byHand bool) bool {
	if util.IsExiting.Load() {
		return false
	}
	if !boot && !exit && !byHand && bootSyncScheduled.Load() {
		return false
	}
	confSyncReadSnapshot := Conf.LoadSync()

	if 2 == confSyncReadSnapshot.Mode && !boot && !exit && !byHand { // 手动模式下只有启动和退出进行同步
		return false
	}

	if 3 == confSyncReadSnapshot.Mode && !byHand { // 完全手动模式下只有手动进行同步
		return false
	}

	if !confSyncReadSnapshot.Enabled {
		if byHand {
			util.PushMsg(Conf.Language(124), 5000)
		}
		return false
	}

	if !cloud.IsValidCloudDirName(confSyncReadSnapshot.CloudName) {
		if byHand {
			util.PushMsg(Conf.Language(123), 5000)
		}
		return false
	}
	if !byHand && !exit && notifyAutoSyncPaused() {
		return false
	}
	return true
}

// incReindex 增量重建索引。
func incReindex(upserts, removes []string) (upsertRootIDs, removeRootIDs []string) {
	upsertRootIDs = []string{}
	removeRootIDs = []string{}

	util.IncBootProgress(3, Conf.Language(308))
	removeRootIDs = removeIndexes(removes) // 先执行 remove，否则移动文档时 upsert 会被忽略，导致未被索引
	upsertRootIDs = upsertIndexes(upserts)

	if 1 > len(removeRootIDs) {
		removeRootIDs = []string{}
	}
	if 1 > len(upsertRootIDs) {
		upsertRootIDs = []string{}
	}
	return
}

func removeIndexes(removeFilePaths []string) (removeRootIDs []string) {
	finishDocTreeChange := cache.BeginDocTreeMutation("")
	defer finishDocTreeChange()
	bootProgressPart := int32(10 / float64(len(removeFilePaths)))
	for _, removeFile := range removeFilePaths {
		if !strings.HasSuffix(removeFile, ".sy") {
			continue
		}

		rootID := util.GetTreeID(removeFile)
		removeRootIDs = append(removeRootIDs, rootID)

		msg := fmt.Sprintf(Conf.Language(39), rootID)
		updateSyncCheckoutIndexMessage(msg)
		util.IncBootProgress(bootProgressPart, msg)
		pushSyncStatusBar(msg)

		cache.RemoveTreeData(rootID)
		block := treenode.GetBlockTree(rootID)
		boxID := ""
		if nil != block {
			boxID = block.BoxID
			cache.RemoveDocIAL(block.Path)
		}
		sql.RemoveTreeQueue(boxID, rootID)
		bts := treenode.GetBlockTreesByRootIDInBox(rootID, boxID)
		for _, b := range bts {
			cache.RemoveBlockIAL(b.ID)
		}
		treenode.RemoveBlockTreesByRootID(boxID, rootID)
	}

	if 1 > len(removeRootIDs) {
		removeRootIDs = []string{}
	}
	return
}

func upsertIndexes(upsertFilePaths []string) (upsertRootIDs []string) {
	finishDocTreeChange := cache.BeginDocTreeMutation("")
	defer finishDocTreeChange()
	luteEngine := util.NewLute()
	bootProgressPart := int32(10 / float64(len(upsertFilePaths)))
	for _, upsertFile := range upsertFilePaths {
		rootID, indexed := func() (string, bool) {
			if !strings.HasSuffix(upsertFile, ".sy") {
				return "", false
			}

			upsertFile = filepath.ToSlash(upsertFile)
			upsertFile = strings.TrimPrefix(upsertFile, "/")

			box, _, found := strings.Cut(upsertFile, "/")
			if !found {
				// .sy 直接出现在 data 文件夹下，没有出现在笔记本文件夹下的情况
				return "", false
			}
			if IsEncryptedBox(box) {
				if !isBoxUnlockedForAccess(box) || !isEncryptedBoxMounted(box) {
					return "", false
				}
				if acquireErr := AcquireEncryptedBoxOperation(box); acquireErr != nil {
					return "", false
				}
				defer ReleaseEncryptedBoxOperation(box)
			}

			p := strings.TrimPrefix(upsertFile, box)
			hpathRefresh.Lock()
			defer hpathRefresh.Unlock()
			msg := fmt.Sprintf(Conf.Language(40), util.GetTreeID(p))
			updateSyncCheckoutIndexMessage(msg)
			util.IncBootProgress(bootProgressPart, msg)
			pushSyncStatusBar(msg)

			rootID := util.GetTreeID(p)
			cache.RemoveTreeData(rootID)
			tree, err0 := filesys.LoadTree(box, p, luteEngine)
			if nil != err0 {
				unindexUnsupportedSyncDocument(box, p, rootID, err0)
				return "", false
			}
			oldDoc := treenode.GetBlockTreeInBox(rootID, box)
			refreshPath := oldDoc != nil && oldDoc.BoxID == box && oldDoc.HPath != tree.HPath
			var refreshKey string
			if refreshPath {
				if refreshKey, err0 = queueHPathRefreshLocked(tree); err0 != nil {
					logging.LogErrorf("queue synced document hpaths [%s] failed: %s", rootID, err0)
					return "", false
				}
			}
			treenode.UpsertBlockTree(tree)
			if refreshPath {
				if err0 = treenode.RefreshDocHPaths(tree); err0 != nil {
					logging.LogErrorf("refresh synced document paths [%s] failed: %s", rootID, err0)
					return "", false
				}
				hpathRefresh.tasks[refreshKey].recover = false
			}
			sql.UpsertTreeQueue(tree)

			bts := treenode.GetBlockTreesByRootIDInBox(rootID, tree.Box)
			for _, b := range bts {
				cache.RemoveBlockIAL(b.ID)
			}
			cache.RemoveDocIAL(tree.Path)
			return rootID, true
		}()
		if indexed {
			upsertRootIDs = append(upsertRootIDs, rootID)
		}
	}

	if 1 > len(upsertRootIDs) {
		upsertRootIDs = []string{}
	}
	return
}

func SetCloudSyncDir(name string) error {
	release := lockAssetSourceChange()
	defer release()
	if !cloud.IsValidCloudDirName(name) {
		return errors.New(Conf.Language(37))
	}

	if Conf.Sync.Load().CloudName == name {
		return nil
	}
	if err := requireCompleteAssetDownloads(); err != nil {
		return err
	}

	if err := prepareSyncSourceChange(); err != nil {
		return err
	}
	UpdateSyncConf(func(s *conf.Sync) { s.CloudName = name })
	refreshLANSyncManager()
	return nil
}

func SetSyncGenerateConflictDoc(b bool) {
	UpdateSyncConf(func(s *conf.Sync) { s.GenerateConflictDoc = b })
}

func SetSyncEnable(b bool) {
	UpdateSyncConf(func(s *conf.Sync) { s.Enabled = b })
	refreshLANSyncManager()
}

func SetSyncInterval(interval int) {
	if 30 > interval {
		interval = 30
	}
	if 43200 < interval {
		interval = 43200
	}

	UpdateSyncConf(func(s *conf.Sync) { s.Interval = interval })
	planSyncAfter(time.Duration(interval) * time.Second)
}
func SetSyncMode(mode int) {
	UpdateSyncConf(func(s *conf.Sync) { s.Mode = mode })
}

func SetSyncProvider(provider int, completeAssets bool) (err error) {
	release := lockAssetSourceChange()
	defer release()
	if provider != Conf.Sync.Load().Provider {
		if completeAssets {
			util.PushEndlessProgress(Conf.Language(398))
			defer util.ClearPushProgress(100)
			err = ensureCompleteSyncAssets(func() { util.PushEndlessProgress(Conf.Language(399)) })
			if err != nil {
				logging.LogWarnf("complete data before switching sync provider [%d -> %d] failed: %s", Conf.Sync.Load().Provider, provider, err)
				err = fmt.Errorf(Conf.Language(400), err)
			}
		} else {
			err = requireCompleteAssetDownloads()
		}
		if err != nil {
			return
		}
		if err = prepareSyncSourceChange(); err != nil {
			return
		}
	}
	UpdateSyncConf(func(s *conf.Sync) { s.Provider = provider })
	refreshLANSyncManager()
	return
}

// validateSyncHTTPEndpoint 在归一化前拒绝空地址，保留省略协议和协议占位符的兼容写法。
func validateSyncHTTPEndpoint(value string) error {
	rawEndpoint := strings.TrimSpace(value)
	if rawEndpoint == "" {
		return errors.New(Conf.Language(142))
	}
	rawEndpoint = strings.Replace(rawEndpoint, "http://http(s)://", "https://", 1)
	rawEndpoint = strings.Replace(rawEndpoint, "http(s)://", "https://", 1)
	if strings.Contains(rawEndpoint, "://") && !strings.HasPrefix(rawEndpoint, "http://") && !strings.HasPrefix(rawEndpoint, "https://") {
		return errors.New(Conf.Language(249))
	}
	endpoint, err := url.Parse(util.NormalizeEndpoint(rawEndpoint))
	if err != nil || endpoint.Hostname() == "" || (endpoint.Scheme != "http" && endpoint.Scheme != "https") {
		return errors.New(Conf.Language(249))
	}
	return nil
}

func validateSyncWebDAV(webdav *conf.WebDAV) error {
	if webdav == nil || conf.MissingSyncProviderField(conf.ProviderWebDAV, map[string]string{"endpoint": webdav.Endpoint}) {
		return errors.New(Conf.Language(142))
	}
	return validateSyncHTTPEndpoint(webdav.Endpoint)
}

func validateSyncLocal(local *conf.Local) error {
	if local == nil || conf.MissingSyncProviderField(conf.ProviderLocal, map[string]string{"endpoint": local.Endpoint}) {
		return errors.New(Conf.Language(142))
	}
	return nil
}

func SetSyncProviderWebDAV(webdav *conf.WebDAV) (err error) {
	release := lockAssetSourceChange()
	defer release()
	if err = validateSyncWebDAV(webdav); err != nil {
		return
	}
	webdav = cloneConfSection(webdav)
	webdav.Endpoint = strings.TrimSpace(webdav.Endpoint)
	webdav.Endpoint = util.NormalizeEndpoint(webdav.Endpoint)

	// 不支持配置坚果云 WebDAV 进行同步 https://github.com/siyuan-note/siyuan/issues/7657
	if strings.Contains(strings.ToLower(webdav.Endpoint), "dav.jianguoyun.com") {
		err = errors.New(Conf.Language(194))
		return
	}

	webdav.Username = strings.TrimSpace(webdav.Username)
	webdav.Password = strings.TrimSpace(webdav.Password)
	webdav.Timeout = util.NormalizeTimeout(webdav.Timeout)
	webdav.ConcurrentReqs = util.NormalizeConcurrentReqs(webdav.ConcurrentReqs, conf.ProviderWebDAV)
	if Conf.Sync.Load().Provider == conf.ProviderWebDAV && (Conf.Sync.Load().WebDAV == nil ||
		Conf.Sync.Load().WebDAV.Endpoint != webdav.Endpoint || Conf.Sync.Load().WebDAV.Username != webdav.Username) {
		if err = requireCompleteAssetDownloads(); err != nil {
			return
		}
		if err = prepareSyncSourceChange(); err != nil {
			return
		}
	}

	UpdateSyncConf(func(s *conf.Sync) { s.WebDAV = webdav })
	refreshLANSyncManager()
	return
}

func SetSyncProviderLocal(local *conf.Local) (err error) {
	release := lockAssetSourceChange()
	defer release()
	if err = validateSyncLocalPath(local); err != nil {
		return
	}
	local = cloneConfSection(local)
	local.Endpoint = strings.TrimSpace(local.Endpoint)
	local.Endpoint = util.NormalizeLocalPath(local.Endpoint)

	local.Timeout = util.NormalizeTimeout(local.Timeout)
	local.ConcurrentReqs = util.NormalizeConcurrentReqs(local.ConcurrentReqs, conf.ProviderLocal)
	if Conf.Sync.Load().Provider == conf.ProviderLocal && (Conf.Sync.Load().Local == nil ||
		filepath.Clean(Conf.Sync.Load().Local.Endpoint) != filepath.Clean(local.Endpoint)) {
		if err = requireCompleteAssetDownloads(); err != nil {
			return
		}
		if err = prepareSyncSourceChange(); err != nil {
			return
		}
	}

	UpdateSyncConf(func(s *conf.Sync) { s.Local = local })
	refreshLANSyncManager()
	return
}

var (
	syncLock             = sync.Mutex{}
	isSyncing            = atomic.Bool{}
	syncAutoRequests     = syncRequestState{}
	syncManualRequests   = syncRequestState{}
	syncExitRequests     = syncRequestState{}
	syncUploadRequests   = syncRequestState{}
	syncDownloadRequests = syncRequestState{}
)

func CreateCloudSyncDir(name string) (err error) {
	assetDownloadSourceMu.RLock()
	defer assetDownloadSourceMu.RUnlock()
	switch Conf.Sync.Load().Provider {
	case conf.ProviderLocal:
		break
	default:
		err = errors.New(Conf.Language(131))
		return
	}

	name = util.RemoveInvalid(name)
	if !cloud.IsValidCloudDirName(name) {
		return errors.New(Conf.Language(37))
	}
	repo, err := newCloudRepositoryWithAssetSourceLocked()
	if err != nil {
		return
	}

	err = repo.CreateCloudRepo(name)
	if err != nil {
		err = errors.New(formatRepoErrorMsg(err))
		return
	}
	return
}

func RemoveCloudSyncDir(name string) (err error) {
	release := lockAssetSourceChange()
	defer release()
	if name == Conf.Sync.Load().CloudName {
		if err = requireCompleteAssetDownloads(); err != nil {
			return
		}
		if err = prepareSyncSourceChange(); err != nil {
			return
		}
	}
	switch Conf.Sync.Load().Provider {
	case conf.ProviderLocal:
		break
	default:
		err = errors.New(Conf.Language(131))
		return
	}

	msgId := util.PushMsg(Conf.Language(116), 15000)
	repo, err := newCloudRepositoryWithAssetSourceLocked()
	if err != nil {
		return
	}

	err = repo.RemoveCloudRepo(name)
	if err != nil {
		err = errors.New(formatRepoErrorMsg(err))
		return
	}

	util.PushClearMsg(msgId)
	time.Sleep(500 * time.Millisecond)
	if Conf.Sync.Load().CloudName == name {
		UpdateSyncConf(func(s *conf.Sync) { s.CloudName = "main" })
		util.PushMsg(Conf.Language(155), 5000)
	}
	return
}

func ListCloudSyncDir() (syncDirs []*Sync, hSize string, err error) {
	assetDownloadSourceMu.RLock()
	defer assetDownloadSourceMu.RUnlock()
	syncDirs = []*Sync{}
	var dirs []*cloud.Repo
	repo, err := newCloudRepositoryWithAssetSourceLocked()
	if err != nil {
		return
	}

	dirs, _, err = repo.GetCloudRepos()
	if err != nil {
		err = errors.New(formatRepoErrorMsg(err))
		return
	}
	if 1 > len(dirs) {
		dirs = append(dirs, &cloud.Repo{
			Name:    "main",
			Size:    0,
			Updated: time.Now().Format("2006-01-02 15:04:05"),
		})
	}

	for _, d := range dirs {
		dirSize := d.Size
		sync := &Sync{
			Size:      dirSize,
			HSize:     "-",
			Updated:   d.Updated,
			CloudName: d.Name,
		}
		syncDirs = append(syncDirs, sync)
	}
	hSize = "-"
	return
}

func formatRepoErrorMsg(err error) string {
	msg := html.EscapeString(err.Error())
	if errors.Is(err, dejavu.ErrSyncSourceChanged) {
		return Conf.Language(463)
	}
	if errors.Is(err, dejavu.ErrSyncSourcePreviewChanged) {
		return Conf.Language(464)
	}
	if errors.Is(err, treenode.ErrSpecTooNew) {
		return Conf.Language(275) + ": " + msg
	}
	if errors.Is(err, cloud.ErrCloudAuthFailed) {
		msg = Conf.Language(31)
	} else if errors.Is(err, cloud.ErrCloudObjectNotFound) {
		msg = Conf.Language(129)
	} else if errors.Is(err, dejavu.ErrLockCloudFailed) {
		msg = Conf.Language(188)
		if detail := cloudLockErrorDetail(err, Conf.Language); "" != detail {
			msg += ": " + detail
		}
	} else if errors.Is(err, dejavu.ErrCloudLocked) {
		msg = Conf.Language(189)
	} else if errors.Is(err, dejavu.ErrRepoFatal) {
		msg = Conf.Language(23)
	} else if errors.Is(err, errSyncCheckoutBusy) {
		msg = Conf.Language(239)
	} else if errors.Is(err, dejavu.ErrIndexFileChanged) {
		// 同步索引期间工作空间文件被修改，明确提示用户稍后重试 https://ld246.com/article/1789052153692
		msg = Conf.Language(384)
	} else if errors.Is(err, cloud.ErrSystemTimeIncorrect) {
		msg = Conf.Language(195)
	} else if errors.Is(err, cloud.ErrDeprecatedVersion) {
		msg = Conf.Language(212)
	} else if errors.Is(err, cloud.ErrCloudCheckFailed) {
		msg = Conf.Language(213)
	} else if errors.Is(err, cloud.ErrCloudServiceUnavailable) {
		msg = Conf.language(219)
	} else if errors.Is(err, cloud.ErrCloudForbidden) {
		msg = Conf.language(249)
	} else if errors.Is(err, cloud.ErrCloudTooManyRequests) {
		msg = Conf.language(250)
	} else if errors.Is(err, cloud.ErrDecryptFailed) {
		msg = Conf.Language(135)
	} else if detail := webDAVErrorDetail(err, Conf.Language); detail != "" {
		msg = detail
	} else {
		logging.LogErrorf("unclassified repository error: %s", msg)
		msgLowerCase := strings.ToLower(msg)
		if strings.Contains(msgLowerCase, "illegal byte sequence") {
			msg = fmt.Sprintf(Conf.Language(397), msg)
		} else if strings.Contains(msgLowerCase, "permission denied") || strings.Contains(msgLowerCase, "access is denied") {
			msg = Conf.Language(33)
		} else if strings.Contains(msgLowerCase, "region was not a valid") {
			msg = Conf.language(254)
		} else if strings.Contains(msgLowerCase, "device or resource busy") || strings.Contains(msg, "is being used by another") {
			// 错误文本可能来自远端 HTTP 响应，必须沿用已转义的 msg
			msg = fmt.Sprintf(Conf.Language(85), msg)
		} else if strings.Contains(msgLowerCase, "cipher: message authentication failed") {
			msg = Conf.Language(135)
		} else if isDNSError(msgLowerCase) {
			msg = Conf.Language(408)
		} else if strings.Contains(msgLowerCase, "net/http: request canceled while waiting for connection") || strings.Contains(msgLowerCase, "exceeded while awaiting") || strings.Contains(msgLowerCase, "context deadline exceeded") || strings.Contains(msgLowerCase, "timeout") || strings.Contains(msgLowerCase, "context cancellation while reading body") {
			msg = Conf.Language(24)
		} else if strings.Contains(msgLowerCase, "connection") || strings.Contains(msgLowerCase, "refused") || strings.Contains(msgLowerCase, "socket") || strings.Contains(msgLowerCase, "eof") || strings.Contains(msgLowerCase, "closed") || strings.Contains(msgLowerCase, "network") {
			msg = Conf.Language(28)
		}
	}
	msg += " (Provider: " + conf.ProviderToStr(Conf.Sync.Load().Provider) + ")"
	return msg
}

// isDNSError 判断错误信息是否属于 DNS 解析类（域名解析失败、主机名无法解析等）。
// dejavu/cloud 层用 fmt.Errorf 原样透传底层网络错误，因此这里用字符串匹配兜底。
func isDNSError(msg string) bool {
	return strings.Contains(msg, "no such host") ||
		strings.Contains(msg, "hostname resolution") ||
		strings.Contains(msg, "no address associated with hostname")
}

// lastDNSFlushTime 及其锁用于 DNS 刷新节流，避免自动同步循环里反复 fork 系统命令。
// 由于同步可能从多个入口并发执行（如启动后台同步与手动同步），这里用互斥锁保护。
var (
	lastDNSFlushTime   time.Time
	lastDNSFlushTimeMu sync.Mutex
)

// flushAndRetryOnDNSError 在 DNS 类错误后请求上层重试一次，成功刷新后节流五分钟。
func flushAndRetryOnDNSError(err error) bool {
	return flushAndRetryOnDNSErrorWithFlush(err, flushDNS)
}

func flushAndRetryOnDNSErrorWithFlush(err error, flush func() error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	if !isDNSError(strings.ToLower(err.Error())) {
		return false
	}

	lastDNSFlushTimeMu.Lock()
	defer lastDNSFlushTimeMu.Unlock()
	if time.Since(lastDNSFlushTime) < 5*time.Minute {
		logging.LogInfof("sync failed with DNS error, but DNS cache was flushed recently, skip retry")
		return false
	}
	if flushErr := flush(); flushErr != nil {
		logging.LogInfof("sync failed with DNS error [%s], DNS cache was not flushed [%s], retrying once", err, flushErr)
		return true
	}
	lastDNSFlushTime = time.Now()
	logging.LogInfof("sync failed with DNS error [%s], flushed DNS cache, retrying once", err)
	return true
}

// syncRepoWithDNSRetry 执行一次同步，若失败且判定为 DNS 类错误，则刷新系统 DNS 缓存后重试一次。
// 统一封装 DNS 重试逻辑，供主同步流程（syncData）与启动后台同步复用。
func syncRepoWithDNSRetry(exit, byHand bool) (cloudPublished bool, err error) {
	return syncRepoWithDNSRetryContext(context.Background(), exit, byHand)
}

func syncRepoWithDNSRetryContext(ctx context.Context, exit, byHand bool) (cloudPublished bool, err error) {
	cloudPublished, err = syncRepoWithContext(ctx, exit, byHand)
	if nil != err && ctx.Err() == nil && flushAndRetryOnDNSError(err) {
		cloudPublished, err = syncRepoWithContext(ctx, exit, byHand)
	}
	return
}

// syncRepoDownloadWithDNSRetry 仅下载同步，DNS 类错误时刷新系统 DNS 缓存后重试一次。
func syncRepoDownloadWithDNSRetry(decisions ...SyncSourceDecision) (err error) {
	err = syncRepoDownloadWithDecision(decisions)
	if nil != err && flushAndRetryOnDNSError(err) {
		err = syncRepoDownloadWithDecision(decisions)
	}
	return
}

// syncRepoUploadWithDNSRetry 仅上传同步，DNS 类错误时刷新系统 DNS 缓存后重试一次。
func syncRepoUploadWithDNSRetry(decisions ...SyncSourceDecision) (err error) {
	err = syncRepoUploadWithDecision(decisions)
	if nil != err && flushAndRetryOnDNSError(err) {
		err = syncRepoUploadWithDecision(decisions)
	}
	return
}

func bootSyncRepoWithDNSRetry(complete func(error)) (scheduled bool, err error) {
	scheduled, err = bootSyncRepo(complete)
	if nil != err && flushAndRetryOnDNSError(err) {
		scheduled, err = bootSyncRepo(complete)
	}
	return
}

func loadSyncIgnoreLines() (ret []string, err error) {
	// 忽略旧版同步配置，读取用户规则失败时仍需保留此规则。
	defer func() {
		ret = append(ret, "/.siyuan/conf.json")
	}()
	// 同步或快照可能重新带回隔离块，加载规则前完成清理。
	if err = util.MigrateAppearanceSyncIgnore(); err != nil {
		return
	}
	ignore := filepath.Join(util.DataDir, ".siyuan", "syncignore")
	err = os.MkdirAll(filepath.Dir(ignore), 0755)
	if err != nil {
		return
	}
	data, err := os.ReadFile(ignore)
	if os.IsNotExist(err) {
		var file *os.File
		file, err = os.OpenFile(ignore, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
		if err == nil {
			err = file.Close()
		} else if os.IsExist(err) {
			data, err = os.ReadFile(ignore)
		}
	}
	if err != nil {
		logging.LogErrorf("read syncignore [%s] failed: %s", ignore, err)
		return
	}
	dataStr := string(data)
	dataStr = strings.ReplaceAll(dataStr, "\r\n", "\n")
	ret = strings.Split(dataStr, "\n")

	// 忽略用户指南
	for _, id := range userGuideIDs {
		ret = append(ret, id+"/**/*")
	}
	// 视图状态仅在当前设备使用，不参与数据同步。
	ret = append(ret, "/storage/view-state.json")
	ret = append(ret, "/storage/view-state-corrupted-*.json")
	// 忽略用户指南的数据库 JSON 文件
	avNames, err := getAllUserGuideAVJSONFiles()
	if err != nil {
		return nil, err
	}
	for _, avName := range avNames {
		ret = append(ret, "/storage/av/"+avName)
	}

	ret = gulu.Str.RemoveDuplicatedElem(ret)
	return
}

func IncSync() {
	util.MarkIndexFixDirty()
	syncSameCount.Store(0)
	planSyncAfter(time.Duration(Conf.Sync.Load().Interval) * time.Second)
	pendingSync.change(notifySyncPending)
}

func notifySyncPending(pending bool) {
	util.BroadcastByType("main", "syncPending", 0, "", pending)
}

func planSyncAfter(d time.Duration) {
	syncPlanTimeLock.Lock()
	syncPlanTime = time.Now().Add(d)
	syncPlanTimeLock.Unlock()
}

var KernelID = gulu.Rand.String(7)
