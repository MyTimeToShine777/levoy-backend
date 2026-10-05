package com.levoy.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.resources.Density
import com.levoy.app.data.*
import com.levoy.app.ui.*
import com.levoy.app.ui.screens.*
import com.levoy.app.ui.theme.LevoyTheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Layers
import com.levoy.app.util.Lang
import com.levoy.app.util.Preset
import org.junit.Rule
import org.junit.Test
import java.time.Instant
import java.time.temporal.ChronoUnit

/** Renders each screen at the reference size (738x1600) with fake data, for comparison with the screenshots. */
class ScreenshotTest {
    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_5.copy(screenWidth = 738, screenHeight = 1600, xdpi = 300, ydpi = 300, density = Density.DPI_300),
        showSystemUi = false,
    )

    private fun snap(name: String, content: @Composable () -> Unit) = paparazzi.snapshot(name) { LevoyTheme { content() } }

    private fun ago(hours: Long) = Instant.now().minus(hours, ChronoUnit.HOURS).toString()
    private val rows = listOf(
        CallRow(1, "+919486613245", "9486613245", "Pugazharasan Medivoy", "outgoing", 12, ago(1), 1, "Jio", "sim"),
        CallRow(2, "+918031463704", "8031463704", null, "incoming", 5, ago(2), 1, "Jio", "sim"),
        CallRow(3, "+917010194778", "7010194778", "Mythreyi Hr Medivoy", "incoming", 54, ago(3), 1, "Jio", "sim"),
        CallRow(4, "+919043222835", "9043222835", null, "rejected", 0, ago(30), 1, "Jio", "sim"),
        CallRow(5, "+917845860720", "7845860720", "Vinoth Developer Buff", "missed", 0, ago(31), null, null, "whatsapp"),
    )
    private val counts = mapOf("all" to 8, "incoming" to 2, "outgoing" to 6)

    private fun shell(tab: Tab, fab: Boolean = true, body: @Composable () -> Unit) = snap("shell") {
        Box(Modifier.fillMaxSize()) {
            body()
            if (fab) DialFab({}, Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 130.dp))
            Box(Modifier.align(Alignment.BottomCenter)) { BottomBar(tab, {}) }
        }
    }

    @Test fun timeFormat() = snap("time_format") { TimeFormatScreen(false, {}, {}) }
    @Test fun language() = snap("language") { LanguageScreen(Lang.En, {}, {}) }
    @Test fun defaultScreen() = snap("default_screen") { DefaultScreenScreen("history", {}, {}) }
    @Test fun settings() = snap("settings") { SettingsScreen(true, SettingsActions(), {}) }
    @Test fun more() = snap("more") { MoreScreen(MoreActions()) }

    @Test fun callHistory() = snap("call_history") {
        Box(Modifier.fillMaxSize()) {
            CallHistoryScreen(CallHistoryUi("all", rows), CallHistoryActions())
            DialFab({}, Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 130.dp))
            Box(Modifier.align(Alignment.BottomCenter)) { BottomBar(Tab.History, {}) }
        }
    }

    @Test fun neverAttended() = snap("not_pickup") {
        Box(Modifier.fillMaxSize()) {
            CallHistoryScreen(
                CallHistoryUi("not_pickup", groups = listOf(
                    AttemptGroup("+916374949577", "6374949577", "Sakthi Bro Nx", 1, listOf(Attempt(1, ago(7)))),
                    AttemptGroup("+918903219715", "8903219715", "Kona Manda Frd", 2, listOf(Attempt(2, ago(50)), Attempt(3, ago(50)))),
                )),
                CallHistoryActions(),
            )
            Box(Modifier.align(Alignment.BottomCenter)) { BottomBar(Tab.History, {}) }
        }
    }

    private val series = Series("hour", (0..23).map { h -> Bucket("2026-10-02T${h.toString().padStart(2, '0')}:00", if (h == 12) 2 else 0, if (h == 6 || h == 12) 3 else 0, 0, 0) })

    @Test fun analytics() = snap("analytics") {
        Box(Modifier.fillMaxSize()) {
            AnalyticsScreen(
                AnalyticsUi(
                    Summary(SummaryRange(), CallsAndDuration(8, 246), CallsAndDuration(2, 59), CallsAndDuration(6, 187), CallsAndDuration(0, 0), CallsAndDuration(0, 0), CallsAndDuration(0, 0), CallsAndDuration(1, 0),
                        null, null, null, listOf("unique_calls", "connected_calls", "working_hours", "ideal_time"), series),
                    rangeLabel = "02-Oct 12:00 AM - 02-Oct 11:59 PM", presetLabel = "Today",
                ),
                AnalyticsActions(),
            )
            Box(Modifier.align(Alignment.BottomCenter)) { BottomBar(Tab.Analytics, {}) }
        }
    }

    @Test fun filter() = snap("filter") {
        FilterScreen(FilterUi(sims = listOf(SimSeen("sim", 1, "Jio True5G | Jio", 10), SimSeen("whatsapp", null, null, 3)), rangeLabel = "23-Jul 12:00 AM - 02-Oct 11:59 PM", presetLabel = "All Time"), FilterActions())
    }

    @Test fun contacts() = snap("contacts") {
        Box(Modifier.fillMaxSize()) {
            ContactsScreen(ContactsUi(listOf(
                ContactRow("6374949577", "+916374949577", "Sakthi Bro Nx", 33, 846),
                ContactRow("7010784191", "+917010784191", "Dhanus Hr's Husband", 28, 600),
                ContactRow("9363286468", "+919363286468", "Aravind B. Com 2", 27, 500),
                ContactRow("9087485125", "+919087485125", "Home", 27, 400),
            )), ContactsActions())
            DialFab({}, Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 130.dp))
            Box(Modifier.align(Alignment.BottomCenter)) { BottomBar(Tab.Contacts, {}) }
        }
    }

    private val detail = ContactDetail(
        ContactHeader("6374949577", "+916374949577", "Sakthi Bro Nx"),
        RangeInfo(Instant.parse("2026-07-27T00:00:00Z").toString(), Instant.parse("2026-10-02T00:00:00Z").toString(), 68),
        mapOf("incoming" to CallsAndDuration(8, 233), "outgoing" to CallsAndDuration(20, 613), "missed" to CallsAndDuration(5, 0), "rejected" to CallsAndDuration(0, 0), "total" to CallsAndDuration(33, 846)),
        ContactAnalysis(Series("month", listOf(Bucket("2026-07", 1, 1, 0, 0), Bucket("2026-08", 6, 10, 2, 0), Bucket("2026-09", 1, 7, 3, 0), Bucket("2026-10", 0, 2, 0, 0))), LongestCall(312, "2026-10-01T10:00:00Z", "outgoing"), FrequentDay("2026-08-24", 3, 1, 2)),
        listOf(HistoryItem(1, "outgoing", 0, ago(2)), HistoryItem(2, "outgoing", 312, ago(20)), HistoryItem(3, "missed", 0, ago(100))),
    )

    @Test fun contactSummary() = snap("contact_summary") { ContactDetailScreen(ContactDetailUi(detail, "summary", title = "Sakthi Bro Nx", number = "+916374949577"), ContactDetailActions()) }
    @Test fun contactAnalysis() = snap("contact_analysis") { ContactDetailScreen(ContactDetailUi(detail, "analysis", title = "Sakthi Bro Nx", number = "+916374949577"), ContactDetailActions()) }
    @Test fun contactHistory() = snap("contact_history") { ContactDetailScreen(ContactDetailUi(detail, "history", title = "Sakthi Bro Nx", number = "+916374949577"), ContactDetailActions()) }
    @Test fun compareEmpty() = snap("compare_empty") { CompareScreen(CompareUi(), {}, {}, {}) }

    private val plan = PlanState(
        plan = "free", status = "active", effective_plan = "free", trial_available = true, enabled = emptyList(),
        catalog = listOf(
            PlanEntry("premium", "Premium", 75.0, features = listOf(PlanFeature("ad_free", "Ad-Free Experience.", "premium"), PlanFeature("b", "Backup and restore of call history", "premium"), PlanFeature("c", "You can now receive quick technical support through Whatsapp.", "premium"))),
            PlanEntry("premium_plus", "Premium Plus", 125.0, features = listOf(PlanFeature("n", "Add a Note and Tags after each call.", "premium_plus"), PlanFeature("x", "Export the contact report in Excel format.", "premium_plus"))),
            PlanEntry("biz", "Levoy Biz", null, features = listOf(PlanFeature("t", "Per-telecaller call analytics and leaderboard", "biz"))),
        ),
    )

    @Test fun premium() = shell(Tab.Premium, fab = false) { PremiumScreen(PremiumUi(plan, "premium"), PremiumActions()) }
    // The platform owner edits plans: renamed, decimal price, an extra plan, and "Free" is not a tab.
    private val editedPlans = PlanState(
        plan = "starter", status = "active", effective_plan = "starter", cancel_at_period_end = true, current_period_end = "2027-01-05T00:00:00Z",
        catalog = listOf(
            PlanEntry("free", "Free", 0.0),
            PlanEntry("starter", "Starter", 99.5, features = listOf(PlanFeature("ad_free", "Ad-Free Experience.", "starter"))),
            PlanEntry("pro", "Pro", 250.0, features = listOf(PlanFeature("ad_free", "Ad-Free Experience.", "starter"), PlanFeature("n", "Add a Note and Tags after each call.", "pro"))),
            PlanEntry("enterprise", "Enterprise", null, features = listOf(PlanFeature("ad_free", "Ad-Free Experience.", "starter"), PlanFeature("n", "Add a Note and Tags after each call.", "pro"), PlanFeature("t", "Per-telecaller call analytics and leaderboard", "enterprise"))),
        ),
    )
    @Test fun premiumEditedPlans() = shell(Tab.Premium, fab = false) { PremiumScreen(PremiumUi(editedPlans, "starter"), PremiumActions()) }
    @Test fun premiumEditedPlansPro() = shell(Tab.Premium, fab = false) { PremiumScreen(PremiumUi(editedPlans, "pro"), PremiumActions()) }

    @Test fun simNumber() = snap("sim_number") { SimNumberScreen(SimUi(listOf(Sim(1, "JIO 4G | Jio", "9344281783", true))), {}, {}) }
    @Test fun simOptions() = snap("sim_options") { SimVerifyOptionsScreen("+919344281783", {}, {}, {}, {}) }
    @Test fun connectSim() = snap("connect_sim") { ConnectSimScreen("Jio True5G | Jio", 1, "91", "", false, {}, {}, {}, {}) }
    @Test fun troubleshootMenu() = snap("troubleshoot_menu") { TroubleshootingMenuScreen({}, {}) }
    @Test fun troubleshootStatus() = snap("troubleshoot_status") { CallSyncStatusScreen(HealthUi(true, true, false), {}, {}, {}, {}, {}) }
    @Test fun quickAction() = snap("quick_action") {
        ToggleInfoScreen("Quick Action", { androidx.compose.material3.Icon(Icons.Filled.Layers, null, tint = com.levoy.app.ui.theme.Pal.text) }, "Quick Action", false, {}, null, "Quick Action Feature :", QUICK_ACTION_BULLETS, {})
    }
    @Test fun whatsapp() = snap("whatsapp") {
        ToggleInfoScreen("WhatsApp Call", { WhatsAppGlyph(Modifier.fillMaxSize(), com.levoy.app.ui.theme.Pal.text) }, "WhatsApp Call", false, {}, "Levoy will be able to read all notifications, including personal information such as contact names and the text of messages you receive.", "Whatsapp Call Log Limitations :", WHATSAPP_BULLETS, {})
    }
    @Test fun privacy() = snap("privacy") { PrivacyScreen({}, {}) }
    @Test fun defaultPhone() = snap("default_phone") { DefaultPhoneScreen({}, {}, {}) }
    @Test fun callLogPrimer() = snap("calllog_primer") {
        PermissionPrimerScreen("ACCESS TO YOUR DEVICE'S CALL LOG", "Your default dialer only shows your call history. Levoy helps you understand it.", "All data is processed locally and remains securely stored on your device.", CALL_LOG_USES, "Allow Access", {}, {})
    }
    @Test fun login() = snap("login") { LoginScreen("", "", "http://10.0.2.2:3001/api", false, 0, false, null, {}, {}, {}, {}, {}, {}, {}) }
    @Test fun loginCode() = snap("login_code") { LoginScreen("asha@company.com", "48", "http://10.0.2.2:3001/api", true, 42, false, null, {}, {}, {}, {}, {}, {}, {}) }

    @Test fun moreWithSocials() = snap("more_socials") {
        MoreScreen(MoreActions(socials = linkedMapOf(Social.X to "https://x.com/a", Social.Instagram to "https://i.com/a", Social.Facebook to "https://f.com/a", Social.Telegram to "https://t.me/a", Social.Reddit to "https://r.com/a")))
    }
    @Test fun linkedExtension() = snap("linked_extension") { LinkedExtensionScreen(true, true, "Google Pixel 7", false, {}, {}, {}) }
    @Test fun help() = snap("help") { HelpScreen("+919000099999", true, {}, {}, {}) }
    @Test fun missingDetails() = snap("missing_details") { MissingDetailsScreen(false, "Checked 212 calls, filled in details for 9", {}, {}) }
    @Test fun blogs() = snap("blogs") { BlogsScreen(null, {}, {}) }
    @Test fun notePopup() = snap("note_popup") { ToggleInfoScreen("Note Popup", { androidx.compose.material3.Icon(Icons.Filled.Layers, null, tint = com.levoy.app.ui.theme.Pal.text) }, "Note Popup", true, {}, null, "How it works :", NOTE_POPUP_BULLETS, {}) }
    @Test fun reminders() = snap("reminders") { RemindersScreen(listOf(Reminder(1, "+919000011111", "Call back about the price list", false, null, "Aanya")), true, {}, {}, {}, {}, {}) }
    @Test fun inCallRinging() = snap("incall_ringing") { com.levoy.app.calls.InCallView(com.levoy.app.calls.InCallUi("Aanya Mehta", "+919000011111", "Incoming call", true), com.levoy.app.calls.InCallActions()) }
    @Test fun inCallActive() = snap("incall_active") { com.levoy.app.calls.InCallView(com.levoy.app.calls.InCallUi("Aanya Mehta", "+919000011111", "1:24", false, muted = true), com.levoy.app.calls.InCallActions()) }
    @Test fun upgradeBanner() = snap("upgrade_banner") { Box(Modifier.fillMaxSize()) { Box(Modifier.align(Alignment.BottomCenter)) { Column { UpgradeBanner({}, {}); BottomBar(Tab.History, {}) } } } }

    @Test fun presetSheet() = snap("preset_sheet") {
        Box(Modifier.fillMaxSize()) { BottomSheet({}) { PresetSheetContent(Preset.AllTime, {}) } }
    }
    @Test fun dialpad() = snap("dialpad") {
        Box(Modifier.fillMaxSize()) { BottomSheet({}) { DialpadContent("", {}, {}, {}, {}) } }
    }
}
