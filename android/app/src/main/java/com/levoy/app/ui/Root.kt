package com.levoy.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FilterAlt
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.levoy.app.AppModel
import com.levoy.app.Os
import com.levoy.app.Overlay
import com.levoy.app.Screen
import com.levoy.app.Stage
import com.levoy.app.data.CallRow
import com.levoy.app.ui.screens.*
import com.levoy.app.ui.theme.CallioColors
import com.levoy.app.ui.theme.CallioTheme
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt
import com.levoy.app.util.DateRange
import com.levoy.app.util.Fmt
import com.levoy.app.util.Preset
import com.levoy.app.util.T
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@Composable
fun CallioRoot(model: AppModel, os: Os) {
    CallioTheme(model.theme) {
        // language and clock format are read from plain objects, so changing them rebuilds the tree once
        key(model.lang, model.is24) { RootContent(model, os) }
    }
}

/** What is shown on top of the tabs (null = nothing pushed) and how deep the stack is, so a transition knows which way to slide. */
private data class PushedScreen(val screen: Screen?, val depth: Int)

@Composable
private fun RootContent(m: AppModel, os: Os) {
    val top = m.stack.lastOrNull()
    BackHandler(enabled = m.overlay != null || m.stack.isNotEmpty() || m.drawerOpen) { if (m.overlay != null) m.overlay = null else if (m.stack.isNotEmpty()) m.pop() else m.drawerOpen = false }

    Box(Modifier.fillMaxSize().background(Pal.background)) {
        when (m.stage) {
            Stage.Privacy -> PrivacyScreen(onAgree = { m.acceptPrivacy() }, onPolicy = { m.push(Screen.Help) })
            Stage.DefaultPhone -> DefaultPhoneScreen(
                onAgree = { os.requestDialerRole { m.afterDefaultPhone() } }, onSkip = { m.afterDefaultPhone() }, onPolicy = { m.push(Screen.Help) },
            )
            Stage.CallLogPrimer -> PermissionPrimerScreen(
                "ACCESS TO YOUR DEVICE'S CALL LOG", "Your default dialer only shows your call history. Callio helps you understand it.",
                "All data is processed locally and remains securely stored on your device.", CALL_LOG_USES, "Allow Access",
                onAllow = { os.requestCallLog { m.afterCallLogPrimer() } }, onPolicy = { m.push(Screen.Help) },
            )
            Stage.ContactsPrimer -> PermissionPrimerScreen(
                "Contacts Access", "Access to contacts allows Callio to map phone numbers to saved contact names, photos, and details. This improves the accuracy and readability of call history, reports, and analytics.",
                "All contact data is accessed only for this purpose and remains stored locally on your device.", CONTACTS_USES, "Let's do it",
                onAllow = { os.requestContacts { m.afterContactsPrimer() } }, onPolicy = { m.push(Screen.Help) },
            )
            Stage.Login -> {
                var email by remember { mutableStateOf("") }
                var code by remember { mutableStateOf("") }
                LoginScreen(
                    email, code, m.codeSent, m.resendIn, m.loginBusy, m.loginError,
                    { email = it },
                    // The sixth digit submits by itself, like the web app.
                    { c -> val d = c.filter { it.isDigit() }.take(6); code = d; if (d.length == 6) m.verifyCode(email, d) },
                    { m.requestCode(email) },
                    { m.verifyCode(email, code) },
                    { code = ""; m.requestCode(email) },
                    { code = ""; m.changeEmail() },
                    resending = m.loginResending,
                )
            }
            Stage.Main -> MainContent(m, os)
        }
        // A pushed screen slides in from the right while the one beneath eases left; going back plays the same thing in reverse.
        // `depth` is how many screens are stacked, which is how we tell "forward" from "back".
        AnimatedContent(
            targetState = PushedScreen(top, m.stack.size),
            modifier = Modifier.fillMaxSize(),
            transitionSpec = {
                val forward = targetState.depth >= initialState.depth
                val slide = tween<IntOffset>(280, easing = FastOutSlowInEasing)
                val transition = if (forward) {
                    (slideInHorizontally(slide) { it / 4 } + fadeIn(tween(220))) togetherWith (slideOutHorizontally(slide) { -it / 6 } + fadeOut(tween(160)))
                } else {
                    (slideInHorizontally(slide) { -it / 6 } + fadeIn(tween(220))) togetherWith (slideOutHorizontally(slide) { it / 4 } + fadeOut(tween(180)))
                }
                transition.apply { targetContentZIndex = if (forward) 1f else -1f }   // whichever is leaving stays on top when going back
            },
            contentKey = { it.screen },
            label = "pushed screen",
        ) { shown ->
            if (shown.screen != null) Box(Modifier.fillMaxSize().background(Pal.background)) { ScreenFor(shown.screen, m, os) }
        }
        m.overlay?.let { OverlayFor(it, m, os) }
    }
}

/* ───────────────────────────── the five root tabs ───────────────────────────── */

@Composable
private fun callActions(os: Os) = CallActions(os::copy, os::sms, os::whatsapp, os::dial)

@Composable
private fun premiumPage(m: AppModel, os: Os) =
    PremiumScreen(PremiumUi(m.plan, m.premiumTab, m.premiumBusy, m.premiumMessage, m.planLoading), PremiumActions({ m.premiumTab = it; m.premiumMessage = null }, { m.subscribe(it, os) }, m::loadPlan))

@Composable
private fun MainContent(m: AppModel, os: Os) {
    val call = callActions(os)
    // the Premium tab only exists on the Free plan: once a plan is bought, the page lives in the side menu
    LaunchedEffect(m.isPremium) { if (m.isPremium && m.tab == Tab.Premium) { m.tab = Tab.History; m.openPremium() } }
    androidx.compose.runtime.CompositionLocalProvider(LocalChrome provides Chrome({ m.drawerOpen = true }, m.planBadge)) {
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f)) {
                // switching tabs fades the old page out and the new one in, instead of swapping instantly
                Crossfade(targetState = m.tab, animationSpec = tween(180), label = "tab") { tab ->
                when (tab) {
                    Tab.History -> {
                        val h = m.history
                        val ui = CallHistoryUi(m.histTab, h?.rows.orEmpty(), h?.groups.orEmpty(), m.histSearch, m.permissionsMissing, m.histLoading, m.histError)
                        CallHistoryScreen(ui, CallHistoryActions(
                            onTab = m::changeHistTab, onSearch = m::changeHistSearch, onFilter = m::openFilter, onExcel = m::openExport,
                            onFix = { os.requestAllPermissions { if (!os.hasCallLogPermission()) os.openAppSettings() else m.syncNow() } },
                            onNote = m::editNote, onDial = { m.overlay = Overlay.Dialpad }, onOpenContact = m::openContact, onRetry = m::loadHistory, call = call,
                        ))
                    }
                    Tab.Analytics -> AnalyticsScreen(
                        AnalyticsUi(m.summary, m.analysis, m.anRange.label(m.summary?.range?.from?.let(Fmt::parse)), presetLabelFor(m.anRange), m.anView, m.anGraphOpen, m.anDuration, m.anSim, m.permissionsMissing, error = m.anError),
                        AnalyticsActions(
                            onRange = { m.overlay = Overlay.RangePicker("analytics") }, onView = m::changeAnView, onGraphToggle = { m.anGraphOpen = !m.anGraphOpen },
                            onDuration = { m.anDuration = it }, onSim = m::changeAnSim,
                            onFix = { os.requestAllPermissions { if (!os.hasCallLogPermission()) os.openAppSettings() else m.syncNow() } }, onRetry = m::loadAnalytics,
                            onUpgrade = { m.openPremium(); m.premiumTab = "premium_plus" },
                            onTile = { t -> m.histTab = t; m.selectTab(Tab.History); m.histRange = m.anRange; m.loadHistory() },
                        ),
                    )
                    Tab.Premium -> Column(Modifier.fillMaxSize().background(Pal.background)) { RootTitle(T("nav_premium")); Box(Modifier.weight(1f)) { premiumPage(m, os) } }
                    Tab.Leads -> LeadsScreen(LeadsUi(m.leads, m.leadSearch, m.leadsLoading, m.leadsError, m.leadNotice), m::changeLeadSearch, m::editLead, os::dial, m::loadLeads, null)
                    Tab.Contacts -> Column(Modifier.fillMaxSize().background(Pal.background)) {
                        RootTitle(T("nav_contacts"))
                        Box(Modifier.weight(1f)) {
                            ContactsScreen(
                                ContactsUi(m.contacts?.rows.orEmpty(), m.contactSearch, error = m.contactsError, total = m.contacts?.total ?: 0),
                                ContactsActions(m::changeContactSearch, { m.openContact(it.phone_key) }, { m.openGroupPicker(it.phone_key) }, m::loadContacts, call),
                            )
                        }
                    }
                }
                }
                if (m.tab == Tab.History || m.tab == Tab.Contacts) DialFab({ m.overlay = Overlay.Dialpad }, Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 16.dp))
            }
            if (m.plan != null && m.plan?.has("ad_free") == false && !m.bannerDismissed && m.tab != Tab.Premium) UpgradeBanner({ m.openPremium() }, { m.bannerDismissed = true })
            BottomBar(m.tab, !m.isPremium, m::selectTab)
        }
        SideDrawer(m, os)
    }
    }
}

/** The hamburger menu: slides in over the current tab, tap outside or press back to close. */
@Composable
private fun SideDrawer(m: AppModel, os: Os) {
    val close = { m.drawerOpen = false }
    androidx.compose.animation.AnimatedVisibility(m.drawerOpen, enter = androidx.compose.animation.fadeIn(), exit = androidx.compose.animation.fadeOut()) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f)).clickable(onClick = close))
    }
    androidx.compose.animation.AnimatedVisibility(
        m.drawerOpen,
        enter = androidx.compose.animation.slideInHorizontally { -it }, exit = androidx.compose.animation.slideOutHorizontally { -it },
    ) {
        Box(Modifier.fillMaxHeight().fillMaxWidth(0.82f).clickable(enabled = false) {}) {
            SideMenu(
                MoreActions(
                    socials = socialLinks(m), openLink = os::openUrl, premium = m::openPremium,
                    export = m::openExport, blogs = { m.push(Screen.Blogs) }, quickCall = { m.push(Screen.LinkedExtension) },
                    reminder = { m.loadReminders(); m.push(Screen.Reminders) }, troubleshooting = { m.push(Screen.Troubleshooting) }, compare = m::openCompare,
                    settings = { m.push(Screen.Settings) }, help = { m.push(Screen.Help) }, invite = { os.shareText("Track and analyse your calls with Callio — ${m.serverUrl.removeSuffix("/api")}") },
                    rate = os::openRating, about = { m.push(Screen.About) }, privacy = { m.push(Screen.Help) },
                ),
                m.user?.name.orEmpty(), m.user?.email.orEmpty(), m.planBadge, close,
            )
        }
    }
}

private fun presetLabelFor(r: DateRange) = presetLabel(r.preset)

/** The social links the workspace admin filled in, in the order the reference shows them. */
private fun socialLinks(m: AppModel): Map<Social, String> = linkedMapOf(
    Social.X to m.ws.social_twitter, Social.Instagram to m.ws.social_instagram, Social.Facebook to m.ws.social_facebook,
    Social.Telegram to m.ws.social_telegram, Social.Reddit to m.ws.social_reddit,
).filterValues { it.isNotBlank() }

/* ───────────────────────────── pushed screens ───────────────────────────── */

@Composable
private fun ScreenFor(s: Screen, m: AppModel, os: Os) {
    val back = m::pop
    when (s) {
        Screen.Filter -> FilterScreen(
            FilterUi(m.filterDraft, m.history?.sims.orEmpty(), m.filterRangeDraft.label(m.history?.rows?.lastOrNull()?.timestamp?.let(Fmt::parse)), presetLabel(m.filterRangeDraft.preset), m.plan?.has("call_notes_tags") == true, m.filterContactMenu, m.filterNotesMenu),
            FilterActions(
                onBack = back, onSim = { m.filterDraft = m.filterDraft.copy(sim = it) }, onRange = { m.overlay = Overlay.RangePicker("filter") },
                onContactMenu = { m.filterContactMenu = !m.filterContactMenu }, onContactType = { m.filterDraft = m.filterDraft.copy(contactType = it); m.filterContactMenu = false },
                onNotesMenu = { m.filterNotesMenu = !m.filterNotesMenu }, onNotes = { m.filterDraft = m.filterDraft.copy(notes = it); m.filterNotesMenu = false },
                onTags = m::openTagPicker,
                onReset = m::resetFilter, onDone = m::applyFilter, onUpgrade = { m.overlay = Overlay.Upgrade("These filters are part of the Premium Plus plan", "Premium Plus") },
            ),
        )
        is Screen.Contact -> {
            val d = m.contactDetail
            ContactDetailScreen(
                ContactDetailUi(d, m.contactTab, m.contactDuration, error = m.contactError, title = d?.contact?.contact_name?.takeIf { it.isNotBlank() } ?: "Unknown", number = d?.contact?.phone_number ?: ""),
                ContactDetailActions(back, { m.contactTab = it }, { m.contactDuration = it }, { m.openGroupPicker(s.key) }, { m.overlay = Overlay.RangePicker("contact") }, { d?.contact?.let { m.overlay = Overlay.ContactMenu(it.phone_key, it.phone_number) } }, { id -> d?.history?.firstOrNull { it.id == id }?.let { h -> m.editNote(CallRow(id = h.id, phone_number = d.contact.phone_number, phone_key = d.contact.phone_key, contact_name = d.contact.contact_name, notes = h.notes)) } }),
            )
        }
        Screen.Compare -> CompareScreen(CompareUi(m.compareRows), { m.push(Screen.ContactPicker) }, { k -> m.compareKeys.remove(k); m.loadCompare() }, back)
        Screen.ContactPicker -> ContactPicker(m, onDone = { m.pop(); m.loadCompare() }, onBack = back)
        Screen.Settings -> SettingsScreen(true, SettingsActions(
            premium = { m.pop(); m.openPremium() }, sim = { m.loadSims(); m.push(Screen.SimNumber) },
            whatsapp = { m.push(Screen.WhatsAppCall) }, quickAction = { m.push(Screen.QuickAction) }, callRecording = { m.push(Screen.CallRecording) }, language = { m.push(Screen.Language) }, theme = { m.push(Screen.Theme) },
            timeFormat = { m.push(Screen.TimeFormat) }, defaultScreen = { m.push(Screen.DefaultScreen) },
            missingDetails = { m.backfillResult = null; m.push(Screen.MissingDetails) },
            defaultDialer = { if (m.defaultDialer) os.openDefaultAppsSettings() else os.requestDialerRole { ok -> m.defaultDialer = ok } },
            backup = { backup(m, os) }, restore = { if (m.hasAutoBackup()) m.overlay = Overlay.RestoreChoice else os.pickBackupFile { json -> restore(m, os, json) } }, deleteAccount = { m.deleteError = null; m.push(Screen.DeleteAccount) }, signOut = m::signOut,
        ), back, m.defaultDialer)
        Screen.TimeFormat -> TimeFormatScreen(m.is24, { m.change24(it) }, back)
        Screen.Language -> LanguageScreen(m.lang, { m.changeLang(it) }, back)
        Screen.Theme -> ThemeScreen(when (m.theme) { com.levoy.app.ui.theme.ThemeMode.Light -> "light"; com.levoy.app.ui.theme.ThemeMode.System -> "system"; else -> "dark" }, { m.setTheme(it) }, back)
        Screen.DefaultScreen -> DefaultScreenScreen(m.defaultScreen, { m.changeDefaultScreen(it) }, back)
        Screen.SimNumber -> SimNumberScreen(SimUi(m.sims, os.deviceSims().map { DetectedSim(it.slot, it.label) }, m.simMessage), m::onSimTapped, back)
        is Screen.SimVerify -> {
            val number = m.sims.firstOrNull { it.slot == s.slot }?.number
            SimVerifyOptionsScreen(number?.let { "+$it" } ?: "your number", onCall = { m.overlay = Overlay.CallNow(s.slot) }, onSkip = { m.overlay = Overlay.SkipVerify }, onBack = back)
        }
        is Screen.ConnectSim -> {
            var code by remember { mutableStateOf("91") }
            var number by remember { mutableStateOf("") }
            val sim = os.deviceSims().firstOrNull { it.slot == s.slot }
            ConnectSimScreen(sim?.label ?: "SIM ${s.slot}", s.slot, code, number, false, { code = it.filter(Char::isDigit) }, { number = it.filter(Char::isDigit) }, {
                if (number.length < 6) os.toast("Enter the phone number of this SIM")
                else m.saveSim(s.slot, sim?.label, code + number, null) { m.pop(); m.push(Screen.SimVerify(s.slot)) }
            }, back)
        }
        Screen.Troubleshooting -> TroubleshootingMenuScreen({ k ->
            when (k) { "sync" -> m.push(Screen.SyncStatus); "note" -> m.push(Screen.NotePopup); "reminder" -> { m.loadReminders(); m.push(Screen.Reminders) }; "quick" -> m.push(Screen.QuickAction); "whatsapp" -> m.push(Screen.WhatsAppCall); else -> m.push(Screen.QuickAction) }
        }, back)
        Screen.SyncStatus -> CallSyncStatusScreen(
            HealthUi(!m.permissionsMissing, m.sims.isNotEmpty() && m.sims.all { it.verified }, os.batteryUnrestricted(), m.lastSync ?: m.syncStatus),
            onDisableBattery = os::openBatterySettings, onFixPermissions = { os.requestAllPermissions { if (!os.hasCallLogPermission()) os.openAppSettings() } },
            onSyncNow = { m.syncNow { os.toast(m.syncStatus ?: "Done") } }, onBack = back,
        )
        Screen.QuickAction -> ToggleInfoScreen("Quick Action", { Icon(Icons.Filled.Layers, null, tint = Pal.text) }, "Quick Action", m.quickAction,
            { v -> if (!v) m.changeQuickAction(false) else if (!os.canDrawOverlays()) { m.session.pendingToggle = "quick_action"; os.openOverlaySettings() } else os.requestOutgoingCalls { m.changeQuickAction(true) } }, null, "Quick Action Feature :", QUICK_ACTION_BULLETS, back)
        Screen.CallRecording -> ToggleInfoScreen("Call Recording", { Icon(Icons.Filled.Mic, null, tint = Pal.text) }, "Call Recording", m.callRecording,
            { v ->
                if (!v) m.setCallRecording(false)
                else os.requestRecordAudio {
                    if (!os.hasRecordAudio()) os.toast("Allow the microphone to record calls")
                    else if (os.isDefaultDialer()) m.setCallRecording(true)
                    else os.requestDialerRole { ok -> m.defaultDialer = ok; if (ok) m.setCallRecording(true) else os.toast("Set Callio as your default phone app to record calls") }
                }
            },
            "Only calls to your assigned leads are recorded, and your admin and managers can listen to them. Tell the person you are calling that the call is recorded.",
            "Call Recording Limitations :", CALL_RECORDING_BULLETS, back)
        Screen.WhatsAppCall -> ToggleInfoScreen("WhatsApp Call", { WhatsAppGlyph(Modifier.fillMaxSize(), Pal.text) }, "WhatsApp Call", m.whatsappCalls,
            { v -> if (v && !os.notificationAccessGranted()) { m.session.pendingToggle = "whatsapp"; os.openNotificationAccess() } else m.setWhatsapp(v) },
            "Callio will be able to read all notifications, including personal information such as contact names and the text of messages you receive.", "Whatsapp Call Log Limitations :", WHATSAPP_BULLETS, back)
        Screen.Reminders -> RemindersScreen(m.reminders, m.missedPrompt, { v -> if (v) os.requestOutgoingCalls { m.changeMissedPrompt(true) } else m.changeMissedPrompt(false) }, { m.overlay = Overlay.AddReminder }, m::finishReminder, os::dial, back)
        Screen.NotePopup -> ToggleInfoScreen("Note Popup", { Icon(Icons.Filled.Description, null, tint = Pal.text) }, "Note Popup", m.notePrompt, { v -> if (v) os.requestOutgoingCalls { m.changeNotePrompt(true) } else m.changeNotePrompt(false) }, null, "How it works :", NOTE_POPUP_BULLETS, back)
        Screen.DeleteAccount -> {
            var typed by remember { mutableStateOf("") }
            DeleteAccountScreen(typed, m.deleteError, m.deleteBusy, { typed = it }, { m.deleteAccount(typed) }, back)
        }
        Screen.ExportReport -> ExportReportScreen(m, os, back)
        Screen.LinkedExtension -> LinkedExtensionScreen(m.quickLinked, m.plan?.has("quick_call_extension") == true, com.levoy.app.calls.QuickCallService.deviceName(), os.hasCallPhone(), { m.toggleQuickCall(os, it) }, { os.requestCallPhone { } }, back)
        Screen.MissingDetails -> MissingDetailsScreen(m.backfillBusy, m.backfillResult, m::backfillDetails, back)
        Screen.Premium -> Column(Modifier.fillMaxSize().background(Pal.background)) { TopBar(T("nav_premium"), back); Box(Modifier.weight(1f)) { premiumPage(m, os) } }
        Screen.Blogs -> BlogsScreen(m.ws.blog_url.ifBlank { null }, { os.openUrl(m.ws.blog_url) }, back)
        Screen.Help -> HelpScreen(m.ws.support_whatsapp.ifBlank { null }, m.plan?.has("whatsapp_support") == true, { os.openUrl("https://wa.me/" + m.ws.support_whatsapp.filter { it.isDigit() }) }, { m.pop(); m.openPremium() }, back)
        Screen.About -> TextInfoScreen("About App", listOf("Callio 1.0.0", "Call tracking and analytics for telecallers and sales teams."), onBack = back)
    }
}

private fun backup(m: AppModel, os: Os) {
    m.viewModelScopeLaunch {
        try { val json = m.api.backup(); os.shareFile(json.toByteArray(), "levoy-backup-${java.time.LocalDate.now()}.json", "application/json") }
        catch (e: Exception) { m.fail(e) }
    }
}

private fun restore(m: AppModel, os: Os, json: String) {
    m.viewModelScopeLaunch {
        try { m.api.restore(json); os.toast("Backup restored"); m.refreshAll() } catch (e: Exception) { m.fail(e) }
    }
}

@Composable
private fun ExportReportScreen(m: AppModel, os: Os, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            TopBar("Export Calls Report", onBack) {
                IconAction(Icons.Filled.FilterAlt, "Filter") { m.overlay = Overlay.RangePicker("export") }
                IconAction(Icons.Filled.TableChart, "Excel") {
                    scope.launch {
                        try {
                            val r = m.api.exportReport(mapOf("date_from" to m.exportRange.fromIso, "date_to" to m.exportRange.toIso, "tz" to java.time.ZonedDateTime.now(Fmt.zone).offset.totalSeconds / 60))
                            os.shareFile(m.api.downloadExport(r.export_id), r.filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                        } catch (e: Exception) { m.fail(e) }
                    }
                }
            }
            RangeStrip(m.exportRange.label(m.exportSummary?.range?.from?.let(Fmt::parse)), presetLabel(m.exportRange.preset)) { m.overlay = Overlay.RangePicker("export") }
            Spacer(Modifier.height(8.dp))
            ScrollTabs(listOf(TabDef("summary", T("summary")), TabDef("history", T("call_history_tab"))), m.exportTab, { m.exportTab = it }, scroll = false)
            val s = m.exportSummary
            if (s == null) Text("Loading…", style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.padding(32.dp))
            // SummaryBlock scrolls by itself: wrapping it in another scroll area crashed this screen (infinite height)
            else if (m.exportTab == "summary") Box(Modifier.weight(1f)) {
                SummaryBlock(mapOf("incoming" to s.incoming, "outgoing" to s.outgoing, "missed" to s.missed, "rejected" to s.rejected, "total" to s.totals))
            } else LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 40.dp)) {
                items(m.exportRows?.rows.orEmpty(), key = { it.id }) { r -> ExportRow(r) }
            }
        }
    }
}

@Composable
private fun ExportRow(r: CallRow) {
    val z = Fmt.parse(r.timestamp)
    val color = when (r.callKind) {
        com.levoy.app.data.CallKind.incoming -> CallioColors.IncomingText
        com.levoy.app.data.CallKind.outgoing -> CallioColors.OutgoingText
        com.levoy.app.data.CallKind.missed -> CallioColors.MissedText
        com.levoy.app.data.CallKind.rejected -> CallioColors.RejectedText
    }
    Column {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(Pal.card), contentAlignment = Alignment.Center) { Text(r.displayName.take(1).uppercase(), style = Txt.Name, color = Pal.text) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1.4f)) { Text(r.displayName, style = Txt.Body.copy(fontSize = 16.sp), color = Pal.text, maxLines = 2); Text(r.phone_number, style = Txt.Number, color = Pal.text) }
            Column(Modifier.weight(1f)) { Text(z?.let { Fmt.dateMed(it) } ?: "", style = Txt.Number, color = Pal.text); Text(z?.let { Fmt.time(it) } ?: "", style = Txt.Number, color = Pal.text) }
            Column(horizontalAlignment = Alignment.End) { Text(r.kind.replaceFirstChar { it.uppercase() }, style = Txt.Number.copy(fontSize = 15.sp), color = color); Text(Fmt.duration(r.duration_seconds), style = Txt.Number, color = Pal.text) }
        }
        Box(Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(0.6.dp).background(Pal.divider))
    }
}

@Composable
private fun ContactPicker(m: AppModel, onDone: () -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            TopBar("Add Contacts (${m.compareKeys.size}/5)", onBack) {
                Text("Done", style = Txt.Button, color = Pal.primary, modifier = Modifier.clickable(onClick = onDone).padding(16.dp))
            }
            SearchField(m.contactSearch, m::changeContactSearch, T("search_contacts"), Modifier.padding(horizontal = 16.dp))
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
                items(m.contacts?.rows.orEmpty(), key = { it.phone_key }) { c ->
                    val on = c.phone_key in m.compareKeys
                    Row(Modifier.fillMaxWidth().clickable { m.toggleCompare(c.phone_key) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(c.contact_name?.takeIf { it.isNotBlank() } ?: c.phone_number.takeLast(2), 46.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) { Text(c.contact_name?.takeIf { it.isNotBlank() } ?: "Unknown", style = Txt.Name, color = Pal.text); Text(c.phone_number, style = Txt.Number, color = Pal.textSecondary) }
                        if (on) Box(Modifier.size(34.dp).clip(CircleShape).background(Pal.primary), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Check, null, tint = Pal.onPrimary) }
                    }
                }
            }
        }
    }
}

/* ───────────────────────────── overlays ───────────────────────────── */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OverlayFor(o: Overlay, m: AppModel, os: Os) {
    when (o) {
        is Overlay.RangePicker -> Box(Modifier.fillMaxSize()) { BottomSheet({ m.overlay = null }) { PresetSheetContent(m.rangeFor(o.target).preset) { m.pickPreset(o.target, it) } } }
        Overlay.CustomRange -> {
            val state = rememberDateRangePickerState()
            Dialog(onDismissRequest = { m.overlay = null }) {
                Column(Modifier.clip(RoundedCornerShape(24.dp)).background(Pal.card).padding(8.dp)) {
                    DateRangePicker(state, Modifier.height(480.dp), showModeToggle = false)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton({ m.overlay = null }) { Text(T("cancel"), color = Pal.text) }
                        TextButton({
                            val a = state.selectedStartDateMillis; val b = state.selectedEndDateMillis ?: a
                            if (a != null && b != null) m.pickCustom(Instant.ofEpochMilli(a).atZone(ZoneOffset.UTC).toLocalDate(), Instant.ofEpochMilli(b).atZone(ZoneOffset.UTC).toLocalDate())
                        }) { Text(T("done"), color = Pal.primary) }
                    }
                }
            }
        }
        Overlay.Dialpad -> {
            var number by remember { mutableStateOf(m.prefillDial.also { m.prefillDial = "" }) }
            Box(Modifier.fillMaxSize()) { BottomSheet({ m.overlay = null }) { DialpadContent(number, { number = it }, { if (it.isNotEmpty()) os.dial(it) }, { if (it.isNotEmpty()) os.whatsapp(it) }, os::copy) } }
        }
        is Overlay.Note -> NoteDialog(o.row, m)
        is Overlay.EditLead -> EditLeadDialog(o.lead, m.callStatuses, m.leadSaving, m.leadSaveError, { m.overlay = null }, { n, p, e, c, pr, nt -> m.saveLead(o.lead, n, p, e, c, pr, nt) })
        is Overlay.GroupPicker -> GroupDialog(o.phoneKey, m)
        is Overlay.Upgrade -> AlertBox(
            o.message, "Upgrade", { m.overlay = null; m.openPremium(); m.premiumTab = m.plan?.catalog?.firstOrNull { it.name.equals(o.plan, true) }?.key ?: "premium_plus" }, "Not now", { m.overlay = null },
        )
        Overlay.SkipVerify -> Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable { m.overlay = null }, contentAlignment = Alignment.Center) {
            SkipVerificationDialog(onYes = { m.overlay = null; (m.stack.lastOrNull() as? Screen.SimVerify)?.let { s -> m.saveSim(s.slot, null, null, "skip") { m.pop() } } }, onNo = { m.overlay = null })
        }
        is Overlay.CallNow -> Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable { m.overlay = null }, contentAlignment = Alignment.Center) {
            val number = m.sims.firstOrNull { it.slot == o.slot }?.number ?: ""
            CallNowDialog(if (number.isEmpty()) "your number" else "+$number", { m.overlay = null }, { m.verifyByCall(os, o.slot) })
        }
        Overlay.AddReminder -> {
            var phone by remember { mutableStateOf("") }
            var note by remember { mutableStateOf("") }
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)), contentAlignment = Alignment.Center) {
                AddReminderDialog(phone, note, { phone = it }, { note = it }, { m.overlay = null }, { if (phone.filter(Char::isDigit).length >= 6) m.addReminder(phone, note) else os.toast("Enter a phone number") })
            }
        }
        is Overlay.Message -> AlertBox(o.text, "OK", { m.overlay = null })
        Overlay.TagPicker -> Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable { m.overlay = null }, contentAlignment = Alignment.Center) {
            DialogCard(Modifier.clickable(enabled = false) {}) {
                Text(T("tags"), style = Txt.Section.copy(fontSize = 22.sp), color = Pal.text)
                Spacer(Modifier.height(10.dp))
                if (m.tags.isEmpty()) Text("No tags yet. Add tags from a call's note.", style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.padding(vertical = 10.dp))
                Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())) {
                    m.tags.forEach { t -> Text(t.name, style = Txt.Body.copy(fontSize = 19.sp), color = if (m.filterDraft.tagId == t.id.toString()) Pal.primary else Pal.text, modifier = Modifier.fillMaxWidth().clickable { m.filterDraft = m.filterDraft.copy(tagId = t.id.toString(), tagName = t.name); m.overlay = null }.padding(vertical = 12.dp)) }
                }
                if (m.filterDraft.tagId.isNotEmpty()) Text("Clear tag", style = Txt.Button.copy(fontSize = 17.sp), color = Pal.primary, modifier = Modifier.clickable { m.filterDraft = m.filterDraft.copy(tagId = "", tagName = ""); m.overlay = null }.padding(vertical = 12.dp))
            }
        }
        is Overlay.ContactMenu -> Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable { m.overlay = null }, contentAlignment = Alignment.Center) {
            DialogCard(Modifier.clickable(enabled = false) {}) {
                listOf<Pair<String, () -> Unit>>(
                    "Call" to { os.dial(o.number) }, "WhatsApp" to { os.whatsapp(o.number) }, "Message" to { os.sms(o.number) }, "Copy number" to { os.copy(o.number) },
                    "Compare with others" to { if (o.phoneKey !in m.compareKeys) m.toggleCompare(o.phoneKey); m.stack.clear(); m.openCompare() },
                ).forEach { (label, run) -> Text(label, style = Txt.Body.copy(fontSize = 19.sp), color = Pal.text, modifier = Modifier.fillMaxWidth().clickable { m.overlay = null; run() }.padding(vertical = 13.dp)) }
            }
        }
        Overlay.RestoreChoice -> Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable { m.overlay = null }, contentAlignment = Alignment.Center) {
            DialogCard(Modifier.clickable(enabled = false) {}) {
                Text(T("restore_import"), style = Txt.Section.copy(fontSize = 22.sp), color = Pal.text)
                Spacer(Modifier.height(14.dp))
                Text("Use automatic backup (saved on this phone by Android Auto Backup)", style = Txt.Body.copy(fontSize = 18.sp), color = Pal.text, modifier = Modifier.fillMaxWidth().clickable { m.overlay = null; m.restoreFromAuto(os) }.padding(vertical = 12.dp))
                Text("Choose a backup file…", style = Txt.Body.copy(fontSize = 18.sp), color = Pal.text, modifier = Modifier.fillMaxWidth().clickable { m.overlay = null; os.pickBackupFile { json -> restore(m, os, json) } }.padding(vertical = 12.dp))
            }
        }
    }
}

@Composable
private fun AlertBox(text: String, primary: String, onPrimary: () -> Unit, secondary: String? = null, onSecondary: () -> Unit = {}) {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable(onClick = onSecondary), contentAlignment = Alignment.Center) {
        DialogCard(Modifier.clickable(enabled = false) {}) {
            Text(text, style = Txt.Body.copy(fontSize = 19.sp, lineHeight = 27.sp), color = Pal.text)
            Spacer(Modifier.height(22.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                if (secondary != null) { Text(secondary, style = Txt.Button.copy(fontSize = 19.sp), color = Pal.text, modifier = Modifier.clickable(onClick = onSecondary).padding(10.dp)); Spacer(Modifier.width(14.dp)) }
                Text(primary, style = Txt.Button.copy(fontSize = 19.sp), color = Pal.primary, modifier = Modifier.clickable(onClick = onPrimary).padding(10.dp))
            }
        }
    }
}

@Composable
private fun NoteDialog(row: CallRow, m: AppModel) {
    var notes by remember { mutableStateOf(row.notes.orEmpty()) }
    var tagText by remember { mutableStateOf(row.tags.joinToString(", ") { it.name }) }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)), contentAlignment = Alignment.Center) {
        DialogCard {
            Text(row.displayName, style = Txt.Name.copy(fontSize = 20.sp), color = Pal.text)
            Text(row.phone_number, style = Txt.Number, color = Pal.textSecondary)
            Spacer(Modifier.height(16.dp))
            Field(notes, { notes = it.take(2000) }, "What was discussed?")
            Spacer(Modifier.height(12.dp))
            Field(tagText, { tagText = it }, "Tags, separated by commas")
            if (m.tags.isNotEmpty()) Text("Existing: " + m.tags.take(6).joinToString { it.name }, style = Txt.Small, color = Pal.textMuted, modifier = Modifier.padding(top = 8.dp))
            Spacer(Modifier.height(18.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                OutlineButton(T("cancel"), { m.overlay = null }, Modifier.weight(1f), height = 56.dp)
                PrimaryButton(T("save"), { m.saveNote(row, notes, tagText.split(',').map { it.trim() }.filter { it.isNotEmpty() }) }, Modifier.weight(1f), height = 56.dp, corner = 16.dp)
            }
        }
    }
}

@Composable
private fun GroupDialog(key: String, m: AppModel) {
    var name by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable { m.overlay = null }, contentAlignment = Alignment.Center) {
        DialogCard(Modifier.clickable(enabled = false) {}) {
            Text(T("add_to_group"), style = Txt.Section.copy(fontSize = 22.sp), color = Pal.text)
            Spacer(Modifier.height(14.dp))
            m.groups.forEach { g ->
                Text(g.name, style = Txt.Body.copy(fontSize = 19.sp), color = Pal.text, modifier = Modifier.fillMaxWidth().clickable { m.addToGroup(key, g) }.padding(vertical = 12.dp))
            }
            Spacer(Modifier.height(10.dp))
            Field(name, { name = it }, "New group name")
            Spacer(Modifier.height(14.dp))
            PrimaryButton("Create & add", { if (name.isNotBlank()) m.newGroup(key, name.trim()) }, Modifier.fillMaxWidth(), height = 56.dp, corner = 16.dp)
        }
    }
}
