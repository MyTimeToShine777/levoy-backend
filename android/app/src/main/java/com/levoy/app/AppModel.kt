package com.levoy.app

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.levoy.app.data.*
import com.levoy.app.sync.AutoBackup
import com.levoy.app.sync.CallLogReader
import com.levoy.app.sync.DeviceCall
import com.levoy.app.sync.CallSync
import com.levoy.app.ui.Tab
import com.levoy.app.ui.screens.FilterState
import com.levoy.app.ui.theme.ThemeMode
import com.levoy.app.util.DateRange
import com.levoy.app.util.Fmt
import com.levoy.app.util.Lang
import com.levoy.app.util.Preset
import com.levoy.app.util.Strings
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Where the person is in the first-run flow. */
enum class Stage { Privacy, DefaultPhone, CallLogPrimer, ContactsPrimer, Login, Main }

/** A full screen pushed on top of the five root tabs. */
sealed interface Screen {
    object Filter : Screen
    data class Contact(val key: String) : Screen
    object Compare : Screen
    object ContactPicker : Screen
    object Settings : Screen
    object TimeFormat : Screen
    object Language : Screen
    object Theme : Screen
    object DefaultScreen : Screen
    object SimNumber : Screen
    data class SimVerify(val slot: Int) : Screen
    data class ConnectSim(val slot: Int) : Screen
    object Troubleshooting : Screen
    object SyncStatus : Screen
    object QuickAction : Screen
    object CallRecording : Screen
    object WhatsAppCall : Screen
    object Reminders : Screen
    object DeleteAccount : Screen
    object ExportReport : Screen
    object Help : Screen
    object About : Screen
    object MissingDetails : Screen
    object LinkedExtension : Screen
    object NotePopup : Screen
    object Blogs : Screen
    object Premium : Screen
}

/** The pop-ups drawn over a screen. */
sealed interface Overlay {
    data class RangePicker(val target: String) : Overlay            // "history" | "analytics" | "filter" | "contact" | "export"
    object CustomRange : Overlay
    object Dialpad : Overlay
    data class Note(val row: CallRow) : Overlay
    data class GroupPicker(val phoneKey: String) : Overlay
    data class Upgrade(val message: String, val plan: String) : Overlay
    object SkipVerify : Overlay
    data class CallNow(val slot: Int) : Overlay
    object AddReminder : Overlay
    data class Message(val text: String) : Overlay
    object TagPicker : Overlay
    data class ContactMenu(val phoneKey: String, val number: String) : Overlay
    object RestoreChoice : Overlay
    data class EditLead(val lead: LeadRow) : Overlay
}

class AppModel(app: Application) : AndroidViewModel(app) {
    val session = Session(app)
    val api = Api(session)

    var stage by mutableStateOf(initialStage())
    var tab by mutableStateOf(if (session.defaultScreen == "analytics") Tab.Analytics else Tab.History)
    val stack = mutableStateListOf<Screen>()
    var overlay by mutableStateOf<Overlay?>(null)

    // appearance
    var theme by mutableStateOf(when (session.theme) { "light" -> ThemeMode.Light; "system" -> ThemeMode.System; else -> ThemeMode.Dark })
    var lang by mutableStateOf(Lang.of(session.language))
    var is24 by mutableStateOf(session.is24Hour)
    var defaultScreen by mutableStateOf(session.defaultScreen)

    init {
        Strings.lang = lang; Fmt.hour24 = is24
        // A call uploaded by the background sync while this screen is open must show up without the person reopening the app.
        viewModelScope.launch { CallSync.uploads.collect { if (stage == Stage.Main) refreshAll() } }
    }

    private fun initialStage(): Stage = when {
        !session.privacyAccepted -> Stage.Privacy
        !CallLogReader.canReadLog(getApplication()) && !session.onboardingDone -> Stage.CallLogPrimer
        session.token == null -> Stage.Login
        else -> Stage.Main
    }

    val user: User? get() = session.user
    var permissionsMissing by mutableStateOf(false)
    var plan by mutableStateOf<PlanState?>(null)
    var planLoading by mutableStateOf(false)
    var bannerDismissed by mutableStateOf(false)
    var premiumTab by mutableStateOf("premium")
    var drawerOpen by mutableStateOf(false)
    /** On a paid plan (including a running trial). */
    val isPremium: Boolean get() = plan?.effective_plan?.let { it.isNotEmpty() && it != "free" } == true
    /** "Premium Plus" ... for the badge next to the person's name; null on the Free plan. */
    val planBadge: String? get() = plan?.takeIf { isPremium }?.let { p -> p.catalog.firstOrNull { it.key == p.effective_plan }?.name ?: p.plan_name ?: "Premium" }
    var premiumBusy by mutableStateOf(false)
    var premiumMessage by mutableStateOf<String?>(null)

    fun viewModelScopeLaunch(block: suspend () -> Unit) { viewModelScope.launch { block() } }

    // ───────────── navigation ─────────────
    fun push(s: Screen) { stack.add(s) }
    fun pop() { if (stack.isNotEmpty()) stack.removeAt(stack.lastIndex) }
    /** Free plan: the Premium tab. Paid plan: the tab is gone, so the page opens over the current screen (reachable from the side menu). */
    fun openPremium() {
        drawerOpen = false
        loadPlan()
        if (isPremium) { plan?.effective_plan?.let { premiumTab = it }; if (stack.lastOrNull() != Screen.Premium) push(Screen.Premium) } else selectTab(Tab.Premium)
    }
    fun selectTab(t: Tab) { stack.clear(); tab = t; if (t == Tab.Premium) loadPlan(); if (t == Tab.Contacts) loadContacts(); if (t == Tab.Analytics) loadAnalytics(); if (t == Tab.Leads) { loadLeads(); loadCallStatuses() } }

    // ───────────── first run / login ─────────────
    fun acceptPrivacy() { session.privacyAccepted = true; stage = if (session.onboardingDone) nextAfterPermissions() else Stage.DefaultPhone }
    fun afterDefaultPhone() { stage = if (CallLogReader.canReadLog(getApplication())) Stage.ContactsPrimer else Stage.CallLogPrimer }
    fun afterCallLogPrimer() { stage = Stage.ContactsPrimer }
    fun afterContactsPrimer() { session.onboardingDone = true; stage = nextAfterPermissions() }
    private fun nextAfterPermissions() = if (session.token == null) Stage.Login else Stage.Main

    var loginBusy by mutableStateOf(false)
    var loginError by mutableStateOf<String?>(null)
    // Two steps: ask for a code (emailed by the server), then submit it.
    var codeSent by mutableStateOf(false)
    var resendIn by mutableStateOf(0)
    private fun startCooldown(seconds: Int) {
        resendIn = seconds
        viewModelScope.launch { while (resendIn > 0) { delay(1000); resendIn -= 1 } }
    }
    /** True while a NEW code is being requested from the code screen, so the button does not claim to be "Signing in…". */
    var loginResending by mutableStateOf(false)
    fun requestCode(email: String) {
        loginBusy = true; loginError = null; loginResending = codeSent
        viewModelScope.launch {
            try {
                val r = api.sendOtp(email.trim())
                codeSent = true; startCooldown(r.resend_in)
            } catch (e: ApiException) { loginError = e.message
            } catch (e: kotlin.coroutines.cancellation.CancellationException) { throw e
            } catch (e: Exception) { loginError = "Something went wrong. Check your connection and try again."
            } finally { loginBusy = false; loginResending = false }
        }
    }
    fun verifyCode(email: String, code: String) {
        if (loginBusy) return
        loginBusy = true; loginError = null
        viewModelScope.launch {
            try {
                val r = api.verifyOtp(email.trim(), code)
                // a platform owner manages Callio from the web console: their login is not a workspace session
                if (r.platform) throw ApiException("This account manages Callio on the web. Sign in with it in a browser at the platform console, not in this app.", 403)
                session.token = r.access_token; session.refreshToken = r.refresh_token; session.user = r.user
                session.forgetRecordingSettingsOfAnotherPerson(r.user.id)
                callRecording = session.callRecording; recordingFolderName = folderLabel(session.recordingFolder)       // show what was kept
                runCatching { api.acceptConsent() }
                codeSent = false; resendIn = 0
                stage = Stage.Main
                onSignedIn()
            } catch (e: ApiException) { loginError = e.message
            } catch (e: kotlin.coroutines.cancellation.CancellationException) { throw e
            } catch (e: Exception) { loginError = "Something went wrong. Check your connection and try again."
            } finally { loginBusy = false }
        }
    }
    fun changeEmail() { codeSent = false; resendIn = 0; loginError = null }

    val serverUrl: String get() = session.serverUrl

    private fun onSignedIn() {
        refreshPermissions()
        CallSync.schedulePeriodic(getApplication())
        CallSync.watchCallLog(getApplication())
        syncNow()
        loadSims(); loadPlan(); loadWorkspace()
        com.levoy.app.push.Push.register(getApplication())
        refreshAll()
    }

    /** Called from MainActivity.onResume. */
    var defaultDialer by mutableStateOf(false)
    var prefillDial by mutableStateOf("")

    fun openDialpadWith(number: String) { prefillDial = number; if (stage == Stage.Main) { stack.clear(); overlay = Overlay.Dialpad } }

    fun onResume(os: Os) {
        defaultDialer = os.isDefaultDialer()
        if (stage != Stage.Main) return
        refreshPermissions()
        if (CallLogReader.canReadLog(getApplication())) CallSync.watchCallLog(getApplication())     // covers a permission granted after sign-in
        syncNow()
        // already signed in from an earlier run: nothing has loaded yet (sign-in is the only other place that does it)
        if (history == null && !histLoading) refreshAll()
        if (plan == null && !planLoading) loadPlan()
        if (awaitingPayment) { awaitingPayment = false; loadPlan() }
        com.levoy.app.push.Push.register(getApplication())     // the token can change; this is cheap and idempotent
        if (!session.notificationsAsked && android.os.Build.VERSION.SDK_INT >= 33) { session.notificationsAsked = true; os.requestNotifications() }
        // a switch the person was granting a permission for turns on when they come back
        when (session.pendingToggle) {
            "quick_action" -> if (os.canDrawOverlays()) { changeQuickAction(true); session.pendingToggle = null }
            "whatsapp" -> if (os.notificationAccessGranted()) { setWhatsapp(true); session.pendingToggle = null }
        }
        checkPendingSimCall(os)
        if (prefillDial.isNotEmpty() && overlay == null) overlay = Overlay.Dialpad
    }

    fun refreshPermissions() {
        val ctx = getApplication<Application>()
        permissionsMissing = !CallLogReader.canReadLog(ctx) || !CallLogReader.has(ctx, android.Manifest.permission.READ_PHONE_STATE) || !CallLogReader.has(ctx, android.Manifest.permission.READ_CONTACTS)
    }

    fun signOut(notice: String? = null) {
        CallSync.cancel(getApplication())
        com.levoy.app.push.Push.unregister(getApplication(), session.token)   // while the token is still ours
        session.refreshToken?.let { key -> viewModelScope.launch { runCatching { api.endSession(key) } } }
        session.signOut()
        com.levoy.app.calls.QuickCallService.stop(getApplication())
        AutoBackup.cancel(getApplication())
        history = null; summary = null; contacts = null; leads = null; plan = null; sims = emptyList(); quickLinked = false
        stack.clear(); overlay = null; tab = Tab.History; stage = Stage.Login
        loginError = notice
    }

    // ───────────── sync ─────────────
    var syncStatus by mutableStateOf<String?>(null)
    var lastSync by mutableStateOf<String?>(null)
    fun syncNow(then: () -> Unit = {}) {
        viewModelScope.launch {
            val r = CallSync.run(getApplication(), session, api)
            when (r) {
                is CallSync.Result.Done -> { lastSync = java.time.ZonedDateTime.now(Fmt.zone).let { "${Fmt.dateMed(it)} ${Fmt.time(it)}" }; syncStatus = if (r.uploaded > 0) "Uploaded ${r.uploaded} calls" else "Up to date" }
                is CallSync.Result.Failed -> if (r.endedSession != null) signOut(r.endedSession.endNotice) else syncStatus = r.message
                CallSync.Result.NotReady -> {}
            }
            then()
        }
    }

    /** "Check last 30 days" on the Call Sync screen. */
    var recheckText by mutableStateOf<String?>(null)
    var recheckBusy by mutableStateOf(false)
    fun recheckCalls() {
        if (recheckBusy) return
        recheckBusy = true; recheckText = null
        viewModelScope.launch {
            recheckText = try { CallSync.recheck(getApplication(), session, api) }
            catch (e: ApiException) { if (e.sessionEnded) { signOut(e.endNotice); null } else e.message }
            catch (e: kotlin.coroutines.cancellation.CancellationException) { throw e }
            catch (e: Exception) { "Something went wrong: ${e.message}" }
            finally { recheckBusy = false }
            refreshAll()
        }
    }

    fun refreshAll() { loadHistory(); loadAnalytics(); loadContacts() }

    private fun tz() = java.time.ZonedDateTime.now(Fmt.zone).offset.totalSeconds / 60

    // ───────────── errors ─────────────
    fun fail(e: Throwable) {
        if (e is ApiException && e.code == 402) overlay = Overlay.Upgrade(e.message ?: "This is a premium feature", e.plan ?: "Premium")
        else if (e is ApiException && e.sessionEnded) signOut(e.endNotice)
        else overlay = Overlay.Message(e.message ?: "Something went wrong")
    }

    // ───────────── call history ─────────────
    var histTab by mutableStateOf("all")
    var histSearch by mutableStateOf("")
    var histRange by mutableStateOf(DateRange.of(Preset.AllTime))
    var filter by mutableStateOf(FilterState())
    var filterDraft by mutableStateOf(FilterState())
    var filterRangeDraft by mutableStateOf(DateRange.of(Preset.AllTime))
    var filterContactMenu by mutableStateOf(false)
    var filterNotesMenu by mutableStateOf(false)
    var history by mutableStateOf<HistoryResponse?>(null)
    var histLoading by mutableStateOf(false)
    var histError by mutableStateOf<String?>(null)
    private var histJob: Job? = null
    private var searchJob: Job? = null

    private fun historyParams(tab: String, range: DateRange, f: FilterState, search: String): Map<String, Any?> = mapOf(
        "tab" to tab, "date_from" to range.fromIso, "date_to" to range.toIso, "search" to search.trim(), "sim" to f.sim, "contact_type" to f.contactType,
        "notes" to f.notes, "tag_id" to f.tagId, "limit" to 200, "tz" to tz(),
    )

    fun loadHistory() {
        histJob?.cancel()
        histLoading = true; histError = null
        histJob = viewModelScope.launch {
            try { history = api.history(historyParams(histTab, histRange, filter, histSearch)) }
            catch (e: ApiException) { if (e.sessionEnded) signOut(e.endNotice) else histError = e.message }
            finally { histLoading = false }
        }
    }
    fun changeHistTab(t: String) { histTab = t; loadHistory() }
    fun changeHistSearch(q: String) { histSearch = q; searchJob?.cancel(); searchJob = viewModelScope.launch { delay(350); loadHistory() } }

    fun openFilter() { filterDraft = filter; filterRangeDraft = histRange; filterContactMenu = false; filterNotesMenu = false; push(Screen.Filter) }
    fun applyFilter() { filter = filterDraft; histRange = filterRangeDraft; pop(); loadHistory() }
    fun resetFilter() { filterDraft = FilterState(); filterRangeDraft = DateRange.of(Preset.AllTime) }

    // ───────────── ranges ─────────────
    fun pickPreset(target: String, p: Preset) {
        if (p == Preset.Custom) { overlay = Overlay.CustomRange; customTarget = target; return }
        applyRange(target, DateRange.of(p)); overlay = null
    }
    private var customTarget = "history"
    fun pickCustom(from: java.time.LocalDate, to: java.time.LocalDate) { applyRange(customTarget, DateRange.of(Preset.Custom, from to to)); overlay = null }
    private fun applyRange(target: String, r: DateRange) {
        when (target) {
            "history" -> { histRange = r; loadHistory() }
            "filter" -> filterRangeDraft = r
            "analytics" -> { anRange = r; loadAnalytics() }
            "contact" -> { contactRange = r; (stack.lastOrNull() as? Screen.Contact)?.let { loadContact(it.key) } }
            "export" -> { exportRange = r; loadExport() }
        }
    }
    fun rangeFor(target: String) = when (target) { "history" -> histRange; "filter" -> filterRangeDraft; "analytics" -> anRange; "contact" -> contactRange; else -> exportRange }

    // ───────────── notes ─────────────
    var tags by mutableStateOf<List<Tag>>(emptyList())
    fun editNote(row: CallRow) {
        // not on a plan that includes notes: take them straight to the Premium page, on the plan that has it
        if (plan?.has("call_notes_tags") == false) { openPremium(); premiumTab = "premium_plus"; return }
        overlay = Overlay.Note(row)
        viewModelScope.launch { runCatching { tags = api.tags() } }
    }
    fun saveNote(row: CallRow, notes: String, tagNames: List<String>) {
        viewModelScope.launch {
            try { api.annotate(row.id, notes, tagNames); overlay = null; loadHistory() } catch (e: Exception) { fail(e) }
        }
    }


    // ───────────── leads ─────────────
    var leads by mutableStateOf<List<LeadRow>?>(null)
    var leadsLoading by mutableStateOf(false)
    var leadsError by mutableStateOf<String?>(null)
    var leadSearch by mutableStateOf("")
    var leadNotice by mutableStateOf<String?>(null)
    var leadSaving by mutableStateOf(false)
    var leadSaveError by mutableStateOf<String?>(null)
    var callStatuses by mutableStateOf(DEFAULT_CALL_STATUSES)
    private var leadsJob: Job? = null
    private var leadSearchJob: Job? = null
    private var leadNoticeJob: Job? = null

    fun loadLeads() {
        leadsJob?.cancel()
        leadsLoading = true; leadsError = null
        leadsJob = viewModelScope.launch {
            try { leads = api.leads(mapOf("search" to leadSearch.trim(), "limit" to 300)) }
            catch (e: ApiException) { if (e.sessionEnded) signOut(e.endNotice) else leadsError = e.message }
            finally { leadsLoading = false }
        }
    }
    fun changeLeadSearch(q: String) { leadSearch = q; leadSearchJob?.cancel(); leadSearchJob = viewModelScope.launch { delay(350); loadLeads() } }

    /** The Call Status choices come from Lead Rules; if this person may not read them, the built-in list is used. */
    fun loadCallStatuses() {
        viewModelScope.launch {
            val rules = runCatching { api.statusRules().status_rules }.getOrNull().orEmpty().filter { it.status_key != NOT_CALLED_KEY && it.call_status.isNotBlank() }
            callStatuses = if (rules.isEmpty()) DEFAULT_CALL_STATUSES
            else rules.map { r -> CallStatusOption(r.call_status, r.pipeline_stage ?: DEFAULT_CALL_STATUSES.firstOrNull { statusKeyOf(it.name) == r.status_key }?.stage) }
        }
    }

    fun editLead(l: LeadRow) { leadSaveError = null; overlay = Overlay.EditLead(l) }

    private fun showLeadNotice(text: String) {
        leadNotice = text
        leadNoticeJob?.cancel()
        leadNoticeJob = viewModelScope.launch { delay(4000); leadNotice = null }
    }

    /** Save the Edit Lead form. A new call status also moves the lead to its pipeline stage, then the lead is read back to confirm it was stored. */
    fun saveLead(lead: LeadRow, name: String, phone: String, email: String, callStatus: String?, priority: String, notes: String) {
        if (leadSaving) return
        if (name.isBlank() || phone.isBlank()) { leadSaveError = "Name and phone are required."; return }
        leadSaving = true; leadSaveError = null
        val changed = statusKeyOf(callStatus.orEmpty()) != statusKeyOf(lead.call_status.orEmpty())
        val stage = if (changed) (if (callStatus == null) "new" else callStatuses.firstOrNull { statusKeyOf(it.name) == statusKeyOf(callStatus) }?.stage) ?: lead.status else lead.status
        viewModelScope.launch {
            try {
                api.updateLead(lead.id, mapOf(
                    "name" to name.trim(), "phone" to phone.trim(), "email" to email.trim().ifEmpty { null },
                    "status" to stage, "call_status" to callStatus, "priority" to priority, "notes" to notes,
                ))
                val label = callStatus ?: "Not called yet"
                if (changed) {
                    // an older server ignores call_status on update: say so instead of claiming it saved
                    val kept = runCatching { api.lead(lead.id) }.getOrNull()
                    if (kept != null && statusKeyOf(kept.call_status.orEmpty()) != statusKeyOf(callStatus.orEmpty())) {
                        loadLeads()
                        overlay = Overlay.Message("Saved, but the server did not store the call status “$label”. It needs an API update to accept call_status.")
                        return@launch
                    }
                    showLeadNotice("Lead updated · $label")
                } else showLeadNotice("Lead updated")
                overlay = null
                loadLeads()
            } catch (e: ApiException) {
                if (e.sessionEnded) signOut(e.endNotice) else leadSaveError = e.message
            } finally { leadSaving = false }
        }
    }

    // ───────────── analytics ─────────────
    // "Today" is usually empty when you open the screen, which looked like Analytics not working; open on the week instead.
    var anRange by mutableStateOf(DateRange.of(Preset.Week))
    var anView by mutableStateOf("summary")
    var anSim by mutableStateOf("")
    var anGraphOpen by mutableStateOf(true)
    var anDuration by mutableStateOf(false)
    var summary by mutableStateOf<Summary?>(null)
    var analysis by mutableStateOf<Analysis?>(null)
    var anError by mutableStateOf<String?>(null)
    private var anJob: Job? = null

    fun loadAnalytics() {
        anJob?.cancel()
        anError = null
        anJob = viewModelScope.launch {
            try {
                val p = mapOf("date_from" to anRange.fromIso, "date_to" to anRange.toIso, "sim" to anSim, "tz" to tz(), "user_id" to user?.takeIf { it.role != "agent" }?.id)
                summary = api.summary(p)
                if (anView == "analysis") analysis = api.analysis(p)
            } catch (e: ApiException) { if (e.sessionEnded) signOut(e.endNotice) else anError = e.message }
        }
    }
    fun changeAnSim(s: String) { anSim = if (anSim == s && s.isNotEmpty()) "" else s; loadAnalytics() }
    fun changeAnView(v: String) { anView = v; loadAnalytics() }

    // ───────────── contacts ─────────────
    var contacts by mutableStateOf<ContactsResponse?>(null)
    var contactSearch by mutableStateOf("")
    var contactsError by mutableStateOf<String?>(null)
    private var contactsJob: Job? = null
    fun loadContacts() {
        contactsJob?.cancel()
        contactsJob = viewModelScope.launch {
            try { contacts = api.contacts(mapOf("search" to contactSearch.trim(), "limit" to 200, "tz" to tz())); contactsError = null }
            catch (e: ApiException) { if (e.sessionEnded) signOut(e.endNotice) else contactsError = e.message }
        }
    }
    fun changeContactSearch(q: String) { contactSearch = q; contactsJob?.cancel(); contactsJob = viewModelScope.launch { delay(350); loadContacts() } }

    var contactRange by mutableStateOf(DateRange.of(Preset.AllTime))
    var contactDetail by mutableStateOf<ContactDetail?>(null)
    var contactTab by mutableStateOf("summary")
    var contactDuration by mutableStateOf(false)
    var contactError by mutableStateOf<String?>(null)
    fun openContact(key: String) { contactDetail = null; contactError = null; contactTab = "summary"; contactRange = DateRange.of(Preset.AllTime); push(Screen.Contact(key)); loadContact(key) }
    fun loadContact(key: String) {
        viewModelScope.launch {
            try { contactDetail = api.contact(key, mapOf("date_from" to contactRange.fromIso, "date_to" to contactRange.toIso, "tz" to tz())) }
            catch (e: ApiException) { contactError = e.message }
        }
    }

    var groups by mutableStateOf<List<GroupRef>>(emptyList())
    fun openGroupPicker(key: String) {
        viewModelScope.launch {
            try { groups = api.groups(); overlay = Overlay.GroupPicker(key) } catch (e: Exception) { fail(e) }
        }
    }
    fun addToGroup(key: String, g: GroupRef) {
        viewModelScope.launch { try { api.addToGroup(g.id, key); overlay = null; loadContacts(); if (stack.lastOrNull() is Screen.Contact) loadContact(key) } catch (e: Exception) { fail(e) } }
    }
    fun newGroup(key: String, name: String) {
        viewModelScope.launch { try { val g = api.createGroup(name); api.addToGroup(g.id, key); overlay = null; loadContacts(); if (stack.lastOrNull() is Screen.Contact) loadContact(key) } catch (e: Exception) { fail(e) } }
    }

    // compare
    val compareKeys = mutableStateListOf<String>()
    var compareRows by mutableStateOf<List<CompareRow>>(emptyList())
    fun openCompare() { push(Screen.Compare); loadCompare() }
    fun loadCompare() {
        if (compareKeys.isEmpty()) { compareRows = emptyList(); return }
        viewModelScope.launch { try { compareRows = api.compare(compareKeys.toList(), mapOf("tz" to tz())) } catch (e: Exception) { fail(e) } }
    }
    fun toggleCompare(key: String) { if (key in compareKeys) compareKeys.remove(key) else if (compareKeys.size < 5) compareKeys.add(key) }

    // ───────────── plan ─────────────
    fun loadPlan() {
        planLoading = true
        viewModelScope.launch {
            try { plan = api.plan(); if (plan?.has("auto_backup") == true) AutoBackup.schedule(getApplication()) else AutoBackup.cancel(getApplication()) }
            catch (e: Exception) { /* a role without the Premium page just stays "free" */ } finally { planLoading = false }
        }
    }
    /** Set while the person is paying in the browser, so the plan is re-read the moment they come back. */
    private var awaitingPayment = false

    /** Free trial first (once); after that, Stripe Checkout in the browser for one month. Only an admin can buy. */
    fun subscribe(planKey: String, os: Os) {
        premiumBusy = true; premiumMessage = null
        viewModelScope.launch {
            try {
                if (plan?.trial_available == true) { plan = api.startTrial(planKey); premiumMessage = "Your ${plan?.trial_days}-day free trial has started" }
                else if (plan?.payments_connected == true) {
                    val c = api.checkout(planKey, 1)
                    awaitingPayment = true
                    premiumMessage = "Finish the payment in your browser, then come back here."
                    os.openUrl(c.url)
                }
                else premiumMessage = "Online payment is not available yet. Contact Callio support to get this plan."
            } catch (e: ApiException) { premiumMessage = if (e.code == 403) "Only a workspace admin can buy a plan." else e.message } finally { premiumBusy = false }
        }
    }

    /** levoy://premium — Stripe's pay page sent the person back. */
    fun onPaymentReturn() { awaitingPayment = false; if (stage == Stage.Main) { stack.clear(); openPremium(); premiumMessage = null } }

    // ───────────── SIMs ─────────────
    var sims by mutableStateOf<List<Sim>>(emptyList())
    var simMessage by mutableStateOf<String?>(null)
    /** Tapping a SIM: ask for its number first if it has none yet, then offer the verify options. */
    fun onSimTapped(slot: Int) { if (sims.firstOrNull { it.slot == slot }?.number.isNullOrBlank()) push(Screen.ConnectSim(slot)) else push(Screen.SimVerify(slot)) }

    /** "Verify via Call Log": the chosen call must really have been placed from this SIM. */
    /** "Verify via Call": dial the SIM's own number; when the person returns, the call log shows which SIM placed it. */
    fun verifyByCall(os: Os, slot: Int) {
        val number = sims.firstOrNull { it.slot == slot }?.number ?: return
        session.pendingSimVerify = "$slot:$number:" + System.currentTimeMillis()
        overlay = null
        os.dial(number)
    }

    private fun checkPendingSimCall(os: Os) {
        val p = session.pendingSimVerify?.split(":") ?: return
        if (p.size < 3) { session.pendingSimVerify = null; return }
        val slot = p[0].toIntOrNull() ?: return; val number = p[1]; val since = p[2].toLongOrNull() ?: 0L
        if (System.currentTimeMillis() - since > 10 * 60_000) { session.pendingSimVerify = null; return }
        val call = CallLogReader.read(getApplication(), since - 5_000).lastOrNull { it.direction == "outgoing" && it.number.takeLast(10) == number.takeLast(10) } ?: return
        session.pendingSimVerify = null
        if (call.simSlot == null || call.simSlot == slot) saveSim(slot, null, null, "call") { overlay = Overlay.Message("SIM $slot verified"); pop() }
        else overlay = Overlay.Message("The call went out on SIM ${call.simSlot}, not SIM $slot. Try again and choose the right SIM.")
    }

    fun loadSims() { viewModelScope.launch { runCatching { sims = api.sims() } } }
    fun saveSim(slot: Int, label: String?, number: String?, method: String?, then: () -> Unit = {}) {
        viewModelScope.launch {
            try {
                val body = mutableMapOf<String, Any?>()
                label?.let { body["label"] = it }; number?.let { body["number"] = it }; method?.let { body["verify_method"] = it }
                api.saveSim(slot, body); loadSims(); then()
            } catch (e: Exception) { fail(e) }
        }
    }

    // ───────────── workspace links, quick call, missing details ─────────────
    var ws by mutableStateOf(WorkspaceSettings())
    fun loadWorkspace() { viewModelScope.launch { runCatching { ws = api.workspace() } } }

    var quickLinked by mutableStateOf(session.quickCallLinked)
    fun toggleQuickCall(os: Os, on: Boolean) {
        if (!on) { session.quickCallLinked = false; quickLinked = false; os.stopQuickCall(); viewModelScope.launch { runCatching { api.unlinkPhone(com.levoy.app.calls.QuickCallService.deviceName()) } }; return }
        // dialling for the browser needs the Phone permission (and notifications for the always-on service)
        os.requestCallPhone {
            session.quickCallLinked = true; quickLinked = true; os.startQuickCall()
            if (plan?.has("quick_call_extension") == false) overlay = Overlay.Upgrade("Placing calls from the browser is part of the Premium plan. Your phone is linked, but the browser will be refused until you upgrade.", "Premium")
        }
    }

    var backfillResult by mutableStateOf<String?>(null)
    var backfillBusy by mutableStateOf(false)
    /** "Missing Call Details": re-read the last 90 days of the call log and fill in names / SIMs the server lacks. */
    fun backfillDetails() {
        backfillBusy = true; backfillResult = null
        viewModelScope.launch {
            try {
                val numbers = api.myLeadNumbers()           // only this person's leads, like the regular sync
                val calls = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { CallLogReader.read(getApplication(), System.currentTimeMillis() - 90L * 86_400_000L, only = numbers) }
                var updated = 0
                for (chunk in calls.chunked(500)) updated += api.backfill(chunk.map { it.toEvent() }).updated
                backfillResult = if (calls.isEmpty()) "No calls to check (is the call-log permission on?)" else "Checked ${calls.size} calls, filled in details for $updated"
                if (updated > 0) refreshAll()
            } catch (e: Exception) { backfillResult = e.message } finally { backfillBusy = false }
        }
    }

    // ───────────── tags in the filter, restore choice ─────────────
    fun openTagPicker() { overlay = Overlay.TagPicker; viewModelScope.launch { runCatching { tags = api.tags() } } }
    fun restoreFromAuto(os: Os) {
        val b = AutoBackup.read(getApplication()) ?: return
        viewModelScope.launch { try { api.restore(b.first); os.toast("Backup restored"); refreshAll() } catch (e: Exception) { fail(e) } }
    }
    fun hasAutoBackup(): Boolean = AutoBackup.read(getApplication()) != null

    // ───────────── reminders ─────────────
    var reminders by mutableStateOf<List<Reminder>>(emptyList())
    fun loadReminders() { viewModelScope.launch { runCatching { reminders = api.reminders() } } }
    fun addReminder(phone: String, note: String) {
        viewModelScope.launch { try { api.addReminder(phone, note.ifBlank { "Call back" }, null); overlay = null; loadReminders() } catch (e: Exception) { fail(e) } }
    }
    fun finishReminder(r: Reminder) { viewModelScope.launch { runCatching { api.finishReminder(r.id) }; loadReminders() } }

    // ───────────── export / backup ─────────────
    var exportRange by mutableStateOf(DateRange.of(Preset.Today))
    var exportTab by mutableStateOf("summary")
    var exportSummary by mutableStateOf<Summary?>(null)
    var exportRows by mutableStateOf<HistoryResponse?>(null)
    fun openExport() { exportRange = histRange.takeIf { it.preset != Preset.AllTime } ?: DateRange.of(Preset.Today); exportSummary = null; exportRows = null; push(Screen.ExportReport); loadExport() }
    fun loadExport() {
        viewModelScope.launch {
            try {
                exportSummary = api.summary(mapOf("date_from" to exportRange.fromIso, "date_to" to exportRange.toIso, "tz" to tz()))
                exportRows = api.history(mapOf("date_from" to exportRange.fromIso, "date_to" to exportRange.toIso, "limit" to 300, "tz" to tz()))
            } catch (e: Exception) { fail(e) }
        }
    }

    var deleteError by mutableStateOf<String?>(null)
    var deleteBusy by mutableStateOf(false)
    fun deleteAccount(email: String) {
        deleteBusy = true; deleteError = null
        viewModelScope.launch {
            try { api.deleteAccount(email.trim()); signOut() } catch (e: ApiException) { deleteError = e.message } finally { deleteBusy = false }
        }
    }

    // ───────────── settings ─────────────
    fun setTheme(key: String) { session.theme = key; theme = when (key) { "light" -> ThemeMode.Light; "system" -> ThemeMode.System; else -> ThemeMode.Dark } }
    fun changeLang(l: Lang) { session.language = l.code; lang = l; Strings.lang = l }
    fun change24(v: Boolean) { session.is24Hour = v; is24 = v; Fmt.hour24 = v }
    fun changeDefaultScreen(k: String) { session.defaultScreen = k; defaultScreen = k }
    var quickAction by mutableStateOf(session.quickAction)
    fun changeQuickAction(v: Boolean) { session.quickAction = v; quickAction = v }
    var notePrompt by mutableStateOf(session.notePrompt)
    fun changeNotePrompt(v: Boolean) { session.notePrompt = v; notePrompt = v }
    var missedPrompt by mutableStateOf(session.missedReminderPrompt)
    fun changeMissedPrompt(v: Boolean) { session.missedReminderPrompt = v; missedPrompt = v }
    var callRecording by mutableStateOf(session.callRecording)
    /** The folder shown on the Call Recording screen (just its name, like "Recordings/Call"), or null when none is chosen. */
    var recordingFolderName by mutableStateOf(folderLabel(session.recordingFolder))
    fun setRecordingFolder(uri: String?) {
        session.recordingFolder = uri
        recordingFolderName = folderLabel(uri)
        if (uri != null) { setCallRecording(true); syncNow() }          // look in the new folder straight away
    }
    private fun folderLabel(uri: String?): String? = uri?.let {
        // content://…/tree/primary%3AMusic%2FCall  ->  "Music/Call"
        runCatching { android.net.Uri.decode(android.net.Uri.parse(it).lastPathSegment.orEmpty()).substringAfter(':') }.getOrNull()?.ifBlank { "Selected folder" } ?: "Selected folder"
    }
    @JvmName("applyCallRecording")
    fun setCallRecording(v: Boolean) { session.callRecording = v; callRecording = v }
    var whatsappCalls by mutableStateOf(session.whatsappCalls)
    fun setWhatsapp(v: Boolean) { session.whatsappCalls = v; whatsappCalls = v }
}
