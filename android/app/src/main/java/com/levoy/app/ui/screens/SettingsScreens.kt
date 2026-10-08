package com.levoy.app.ui.screens

import com.levoy.app.ui.PlanBadge
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Contrast
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Diamond
import androidx.compose.material.icons.filled.Dialpad
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SimCard
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.PhoneCallback
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.QuestionMark
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextDecoration
import com.levoy.app.ui.FullScreen
import com.levoy.app.ui.ChoiceRow
import com.levoy.app.ui.MenuCard
import com.levoy.app.ui.SettingsRow
import com.levoy.app.ui.TopBar
import com.levoy.app.ui.WhatsAppGlyph
import com.levoy.app.ui.theme.LevoyColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt
import com.levoy.app.util.Lang
import com.levoy.app.util.T

private val iconBox = Modifier.size(28.dp)
@Composable private fun Ic(v: ImageVector, tint: Color = Pal.text) = Icon(v, null, tint = tint, modifier = iconBox)

/* ───────────────────────────── single-choice screens ───────────────────────────── */

@Composable
fun ChoiceScreen(title: String, options: List<Pair<String, String>>, selected: String, onPick: (String) -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxWidth()) {
            TopBar(title, onBack)
            Spacer(Modifier.height(10.dp))
            options.forEach { (key, label) -> ChoiceRow(label, key == selected) { onPick(key) } }
        }
    }
}

@Composable
fun TimeFormatScreen(is24: Boolean, onPick: (Boolean) -> Unit, onBack: () -> Unit) =
    ChoiceScreen(T("time_format"), listOf("12" to "12 hr", "24" to "24 hr"), if (is24) "24" else "12", { onPick(it == "24") }, onBack)

@Composable
fun LanguageScreen(selected: Lang, onPick: (Lang) -> Unit, onBack: () -> Unit) =
    ChoiceScreen(T("language"), Lang.entries.map { it.code to it.native }, selected.code, { onPick(Lang.of(it)) }, onBack)

@Composable
fun DefaultScreenScreen(selected: String, onPick: (String) -> Unit, onBack: () -> Unit) =
    ChoiceScreen(T("default_screen"), listOf("history" to T("call_history_name"), "analytics" to T("analytics_name")), selected, onPick, onBack)

@Composable
fun ThemeScreen(selected: String, onPick: (String) -> Unit, onBack: () -> Unit) =
    ChoiceScreen(T("theme"), listOf("light" to T("theme_light"), "dark" to T("theme_dark"), "system" to T("theme_system")), selected, onPick, onBack)

/* ───────────────────────────── settings list ───────────────────────────── */

data class SettingsActions(
    val premium: () -> Unit = {}, val sim: () -> Unit = {}, val whatsapp: () -> Unit = {}, val quickAction: () -> Unit = {},
    val language: () -> Unit = {}, val theme: () -> Unit = {}, val timeFormat: () -> Unit = {}, val defaultScreen: () -> Unit = {},
    val missingDetails: () -> Unit = {}, val defaultDialer: () -> Unit = {}, val backup: () -> Unit = {}, val restore: () -> Unit = {},
    val deleteAccount: () -> Unit = {}, val signOut: () -> Unit = {},
)

@Composable
fun SettingsScreen(showPremiumRow: Boolean, a: SettingsActions, onBack: () -> Unit, defaultDialer: Boolean = false) {
    FullScreen {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
            TopBar(T("more_settings"), onBack)
            Spacer(Modifier.height(6.dp))
            if (showPremiumRow) SettingsRow({ Ic(Icons.Filled.Diamond, LevoyColors.Amber) }, T("premium_settings"), a.premium)
            SettingsRow({ WhatsAppGlyph(Modifier.size(30.dp), Pal.text) }, T("whatsapp_call"), a.whatsapp)
            SettingsRow({ Ic(Icons.Filled.Smartphone) }, T("quick_action"), a.quickAction)
            SettingsRow({ Ic(Icons.Filled.Language) }, T("language"), a.language)
            SettingsRow({ Ic(Icons.Filled.Contrast) }, T("theme"), a.theme)
            SettingsRow({ Ic(Icons.Filled.Timer) }, T("time_format"), a.timeFormat)
            SettingsRow({ Ic(Icons.Filled.Layers) }, T("default_screen"), a.defaultScreen)
            SettingsRow({ Ic(Icons.Filled.QuestionMark) }, T("missing_details"), a.missingDetails)
            SettingsRow({ Ic(Icons.Filled.Dialpad) }, if (defaultDialer) T("remove_dialer") else T("set_dialer"), a.defaultDialer)
            SettingsRow({ Ic(Icons.Filled.FileDownload) }, T("backup_export"), a.backup)
            SettingsRow({ Ic(Icons.Filled.FileUpload) }, T("restore_import"), a.restore)
            SettingsRow({ Ic(Icons.Filled.Delete) }, T("delete_account"), a.deleteAccount)
            SettingsRow({ Ic(Icons.Filled.Call) }, T("sign_out"), a.signOut)
            Spacer(Modifier.height(24.dp))
        }
    }
}

/* ───────────────────────────── More menu ───────────────────────────── */

data class MoreActions(
    val socials: Map<Social, String> = emptyMap(), val openLink: (String) -> Unit = {}, val premium: () -> Unit = {},
    val export: () -> Unit = {}, val blogs: () -> Unit = {}, val quickCall: () -> Unit = {}, val reminder: () -> Unit = {},
    val troubleshooting: () -> Unit = {}, val compare: () -> Unit = {}, val settings: () -> Unit = {}, val help: () -> Unit = {},
    val invite: () -> Unit = {}, val rate: () -> Unit = {}, val about: () -> Unit = {}, val privacy: () -> Unit = {},
)

/** The hamburger side menu (what used to be the More tab): who is signed in, their plan badge, then every extra screen. */
@Composable
fun SideMenu(a: MoreActions, userName: String, userEmail: String, badge: String?, close: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Pal.background).verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(28.dp))
        Row(Modifier.padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
            LevoyLogo(Modifier.size(56.dp))
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(userName.ifBlank { "Levoy" }, style = Txt.Section.copy(fontSize = 19.sp), color = Pal.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (userEmail.isNotBlank()) Text(userEmail, style = Txt.Small, color = Pal.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (badge != null) {
            Spacer(Modifier.height(12.dp))
            PlanBadge(badge, Modifier.padding(horizontal = 18.dp))
        }
        Spacer(Modifier.height(16.dp))
        SocialRow(a.socials, a.openLink)
        Spacer(Modifier.height(if (a.socials.isEmpty()) 4.dp else 16.dp))
        val m = Modifier.size(28.dp)
        fun go(f: () -> Unit): () -> Unit = { close(); f() }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            MenuCard({ Icon(Icons.Filled.Diamond, null, tint = LevoyColors.Amber, modifier = m) }, if (badge != null) "My plan" else T("nav_premium"), go(a.premium))
            MenuCard({ Icon(Icons.Filled.IosShare, null, tint = Pal.text, modifier = m) }, T("export_report"), go(a.export))
            MenuCard({ Icon(Icons.Filled.MenuBook, null, tint = Pal.text, modifier = m) }, T("blogs"), go(a.blogs))
            MenuCard({ Icon(Icons.Filled.Computer, null, tint = Pal.text, modifier = m) }, T("quick_call_ext"), go(a.quickCall))
            MenuCard({ Icon(Icons.Filled.NotificationsActive, null, tint = LevoyColors.Missed, modifier = m) }, T("missed_reminder"), go(a.reminder))
            MenuCard({ Icon(Icons.Filled.Warning, null, tint = Pal.text, modifier = m) }, T("troubleshooting"), go(a.troubleshooting))
            MenuCard({ Icon(Icons.Filled.SwapHoriz, null, tint = Pal.text, modifier = m) }, T("compare"), go(a.compare))
            MenuCard({ Icon(Icons.Filled.Settings, null, tint = Pal.text, modifier = m) }, T("more_settings"), go(a.settings))
            MenuCard({ Icon(Icons.Filled.HelpOutline, null, tint = Pal.text, modifier = m) }, T("help_support"), go(a.help))
            MenuCard({ Icon(Icons.Filled.PersonAdd, null, tint = Pal.text, modifier = m) }, T("invite"), go(a.invite))
            MenuCard({ Icon(Icons.Filled.StarBorder, null, tint = Pal.text, modifier = m) }, T("rate"), go(a.rate))
            MenuCard({ Icon(Icons.Filled.Info, null, tint = Pal.text, modifier = m) }, T("about"), go(a.about))
        }
        Spacer(Modifier.height(10.dp))
        Text(T("privacy_policy"), style = Txt.Small.copy(textDecoration = TextDecoration.Underline), color = Pal.text, modifier = Modifier.padding(horizontal = 18.dp).clickable(onClick = go(a.privacy)).padding(vertical = 12.dp))
        Spacer(Modifier.height(28.dp))
    }
}

/** The app mark: an open ring (amber → green, red at the foot) around a handset, with rising bars. */
@Composable
fun LevoyLogo(modifier: Modifier = Modifier) {
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width * 0.13f
            val inset = w / 2
            val tl = Offset(inset, inset)
            val sz = Size(size.width - w, size.height - w)
            drawArc(Color(0xFFFFA500), 140f, 130f, false, tl, sz, style = Stroke(w, cap = StrokeCap.Butt))
            drawArc(Color(0xFF8DC800), 285f, 80f, false, tl, sz, style = Stroke(w, cap = StrokeCap.Butt))
            drawArc(Color(0xFFFF4B4B), 85f, 55f, false, tl, sz, style = Stroke(w, cap = StrokeCap.Butt))
            val bw = size.width * 0.09f
            drawRect(Color(0xFFFF4B4B), Offset(size.width * 0.52f, size.height * 0.78f), Size(bw, size.height * 0.1f))
            drawRect(Color(0xFFFFA500), Offset(size.width * 0.64f, size.height * 0.68f), Size(bw, size.height * 0.2f))
            drawRect(Color(0xFF8DC800), Offset(size.width * 0.76f, size.height * 0.56f), Size(bw, size.height * 0.32f))
        }
        Icon(Icons.Filled.Call, null, tint = Color.White, modifier = Modifier.fillMaxSize(0.38f))
    }
}
