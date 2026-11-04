package com.levoy.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Battery0Bar
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallMade
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.HistoryToggleOff
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material.icons.filled.SimCard
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.levoy.app.data.Reminder
import com.levoy.app.data.Sim
import com.levoy.app.ui.PrimaryButton
import com.levoy.app.ui.FullScreen
import com.levoy.app.ui.OutlineButton
import com.levoy.app.ui.SettingsRow
import com.levoy.app.ui.SwitchPill
import com.levoy.app.ui.TopBar
import com.levoy.app.ui.WhatsAppGlyph
import com.levoy.app.ui.theme.CallioColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt
import com.levoy.app.util.T

/* ───────────────────────────── shared bits ───────────────────────────── */

@Composable
fun InfoLine(text: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.Top) {
        Icon(Icons.Outlined.Info, null, tint = Pal.textSecondary, modifier = Modifier.size(30.dp))
        Spacer(Modifier.width(14.dp))
        Text(text, style = Txt.Body.copy(fontSize = 15.sp), color = Pal.textSecondary)
    }
}

@Composable
fun BulletText(text: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.Top) {
        Text("●", style = Txt.Body.copy(fontSize = 10.sp), color = Pal.text, modifier = Modifier.padding(top = 8.dp, end = 14.dp))
        Text(text, style = Txt.Body.copy(fontSize = 19.sp, lineHeight = 28.sp), color = Pal.text)
    }
}

@Composable
fun DialogCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth().padding(horizontal = 12.dp).clip(RoundedCornerShape(26.dp)).background(Pal.background).padding(24.dp)) { content() }
}

/* ───────────────────────────── SIM numbers ───────────────────────────── */

data class SimUi(val sims: List<Sim> = emptyList(), val detected: List<DetectedSim> = emptyList(), val message: String? = null)
data class DetectedSim(val slot: Int, val label: String)

@Composable
fun SimNumberScreen(ui: SimUi, onVerify: (Int) -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            TopBar("SIM Number", onBack)
            InfoLine("Due to Latest Google Policy & Android Version we have to collect required information by verifying your phone number.")
            Spacer(Modifier.height(10.dp))
            val all = (ui.detected.map { it.slot } + ui.sims.map { it.slot }).distinct().sorted()
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                all.forEach { slot ->
                    val saved = ui.sims.firstOrNull { it.slot == slot }
                    val label = saved?.label ?: ui.detected.firstOrNull { it.slot == slot }?.label ?: "SIM $slot"
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Pal.card).clickable { onVerify(slot) }.padding(horizontal = 18.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.SimCard, null, tint = Pal.text, modifier = Modifier.size(46.dp))
                            Text(slot.toString(), style = Txt.Small.copy(fontSize = 15.sp, fontWeight = FontWeight.Bold), color = Pal.card, modifier = Modifier.padding(top = 6.dp))
                        }
                        Spacer(Modifier.width(18.dp))
                        Column(Modifier.weight(1f)) {
                            Text(label, style = Txt.Section.copy(fontSize = 21.sp), color = Pal.text)
                            Text(saved?.number ?: "Not added", style = Txt.Body.copy(fontSize = 20.sp), color = Pal.text)
                        }
                        if (saved?.verified == true) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(Icons.Filled.CheckCircle, null, tint = CallioColors.Success, modifier = Modifier.size(36.dp))
                                Text("Verified", style = Txt.Body.copy(fontSize = 19.sp), color = Pal.text)
                            }
                        } else Text("Verify", style = Txt.Button.copy(fontSize = 17.sp), color = Pal.primary)
                    }
                }
            }
            if (ui.message != null) Text(ui.message, style = Txt.Body.copy(fontSize = 15.sp), color = Pal.primary, modifier = Modifier.padding(16.dp))
        }
    }
}

@Composable
fun ConnectSimScreen(label: String, slot: Int, countryCode: String, number: String, busy: Boolean, onCode: (String) -> Unit, onNumber: (String) -> Unit, onSubmit: () -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            TopBar("Connect Sim", onBack)
            InfoLine("Due to Latest Google Policy & Android Version we have to collect required information by verifying your phone number.")
            Spacer(Modifier.height(10.dp))
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.SimCard, null, tint = Pal.text, modifier = Modifier.size(46.dp))
                    Text(slot.toString(), style = Txt.Small.copy(fontSize = 15.sp, fontWeight = FontWeight.Bold), color = Pal.background, modifier = Modifier.padding(top = 6.dp))
                }
                Spacer(Modifier.width(18.dp))
                Text(label, style = Txt.Section.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold), color = Pal.text)
            }
            Spacer(Modifier.height(44.dp))
            Field(countryCode, onCode, "Country code", Modifier.padding(horizontal = 16.dp), KeyboardType.Number)
            Spacer(Modifier.height(30.dp))
            Field(number, onNumber, "Phone Number", Modifier.padding(horizontal = 16.dp), KeyboardType.Phone)
            Spacer(Modifier.height(30.dp))
            PrimaryButton(if (busy) "…" else "Submit", onSubmit, Modifier.fillMaxWidth().padding(horizontal = 16.dp), height = 66.dp, corner = 22.dp, upper = true)
        }
    }
}

@Composable
fun Field(value: String, onChange: (String) -> Unit, hint: String, modifier: Modifier = Modifier, keyboard: KeyboardType = KeyboardType.Text, password: Boolean = false) {
    Box(modifier.fillMaxWidth().height(66.dp).clip(RoundedCornerShape(22.dp)).background(Pal.card).border(1.dp, Pal.divider.copy(alpha = 0.5f), RoundedCornerShape(22.dp)).padding(horizontal = 20.dp), contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) Text(hint, style = Txt.Body.copy(fontSize = 19.sp), color = Pal.textSecondary)
        BasicTextField(
            value, onChange, singleLine = true, textStyle = Txt.Body.copy(fontSize = 19.sp, color = Pal.text), cursorBrush = SolidColor(Pal.primary),
            keyboardOptions = KeyboardOptions(keyboardType = keyboard), visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
fun SimVerifyOptionsScreen(number: String, onCall: () -> Unit, onSkip: () -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            TopBar("SIM Number", onBack)
            Text("Choose one of the option to verify your number", style = Txt.Heading.copy(fontSize = 27.sp, lineHeight = 36.sp), color = Pal.text, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp))
            Spacer(Modifier.height(10.dp))
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                OptionCard(Icons.Filled.Call, "Verify via Call", "App will make a dummy call to your number itself.", onCall)
                OptionCard(Icons.Filled.Block, "Skip Verification", "(Not Recommended)\nVerification process will be skipped and you would be able to use app. However, you may face issue with reports and upcoming versions.", onSkip)
            }
        }
    }
}

@Composable
private fun OptionCard(icon: ImageVector, title: String, body: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Pal.card).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 16.dp)) {
        Icon(icon, null, tint = Pal.text, modifier = Modifier.size(34.dp).padding(top = 2.dp))
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = Txt.Section.copy(fontSize = 22.sp), color = Pal.text)
            Spacer(Modifier.height(4.dp))
            Text(body, style = Txt.Body.copy(fontSize = 16.sp, lineHeight = 22.sp), color = Pal.textSecondary)
        }
        Icon(Icons.Filled.ChevronRight, null, tint = Pal.text, modifier = Modifier.size(28.dp))
    }
}

@Composable
fun SkipVerificationDialog(onYes: () -> Unit, onNo: () -> Unit) {
    DialogCard {
        Text("Are you sure you want to skip verification?\n\nThe app won't be able to identify which SIM is used for a call log and may face issue with reports and upcoming versions.\n\nPlease note that you can verify this number from Settings > SIM Number.", style = Txt.Body.copy(fontSize = 20.sp, lineHeight = 28.sp), color = Pal.text)
        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Text("Yes Skip", style = Txt.Button.copy(fontSize = 21.sp), color = Color(0xFFFF6B6B), modifier = Modifier.clickable(onClick = onYes).padding(8.dp))
            Spacer(Modifier.width(18.dp))
            Text("NO", style = Txt.Button.copy(fontSize = 21.sp), color = Pal.text, modifier = Modifier.clickable(onClick = onNo).padding(8.dp))
        }
    }
}

@Composable
fun CallNowDialog(number: String, onBack: () -> Unit, onCall: () -> Unit) {
    DialogCard {
        Text("To verify your number, app will make a call to $number. It will help to identify the SIM.\n\nYou just need to disconnect the call after 5 seconds.", style = Txt.Body.copy(fontSize = 20.sp, lineHeight = 28.sp), color = Pal.text)
        Spacer(Modifier.height(22.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            OutlineButton("Back", onBack, Modifier.weight(1f), height = 64.dp)
            PrimaryButton("Call Now", onCall, Modifier.weight(1f), height = 64.dp, corner = 16.dp)
        }
    }
}

/** The call-log picker sheet: pick the call you made from this SIM. */
/* ───────────────────────────── troubleshooting ───────────────────────────── */

@Composable
fun TroubleshootingMenuScreen(onItem: (String) -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            TopBar("Troubleshooting", onBack)
            Spacer(Modifier.height(6.dp))
            SettingsRow({ Icon(Icons.Filled.Call, null, tint = Pal.text, modifier = Modifier.size(30.dp)) }, "Call Sync", onClick = { onItem("sync") })
            SettingsRow({ Icon(Icons.Filled.Description, null, tint = Pal.text, modifier = Modifier.size(30.dp)) }, "Note Popup", onClick = { onItem("note") })
            SettingsRow({ Icon(Icons.Filled.NotificationsActive, null, tint = CallioColors.Missed, modifier = Modifier.size(30.dp)) }, "Missed Call Reminder", onClick = { onItem("reminder") })
            SettingsRow({ Icon(Icons.Filled.Computer, null, tint = Pal.text, modifier = Modifier.size(30.dp)) }, "Quick Action", onClick = { onItem("quick") })
            SettingsRow({ WhatsAppGlyph(Modifier.size(32.dp), Pal.text) }, "WhatsApp Call", onClick = { onItem("whatsapp") })
        }
    }
}

data class HealthUi(val permissionsOk: Boolean, val simVerified: Boolean, val batteryUnrestricted: Boolean, val lastSync: String? = null)

@Composable
fun CallSyncStatusScreen(h: HealthUi, onDisableBattery: () -> Unit, onFixPermissions: () -> Unit, onSyncNow: () -> Unit, onBack: () -> Unit,
    onRecheck: () -> Unit = {}, recheckBusy: Boolean = false, recheckText: String? = null) {
    FullScreen {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            TopBar("Troubleshooting", onBack)
            Spacer(Modifier.height(24.dp))
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(30.dp)) {
                StatusItem(h.permissionsOk, if (h.permissionsOk) "Permissions Granted" else "Permissions Missing", Icons.Filled.CheckCircle,
                    if (h.permissionsOk) "Access to your call logs and contacts has been confirmed. The app can now automatically track calls and provide accurate reports."
                    else "Callio needs access to your call log and contacts to track calls. Please grant the missing permissions.",
                    if (h.permissionsOk) null else "Grant Permissions" to onFixPermissions)
                StatusItem(h.batteryUnrestricted, if (h.batteryUnrestricted) "Battery Optimization Disabled" else "Battery Optimization Disabled", Icons.Filled.Battery0Bar,
                    if (h.batteryUnrestricted) "Battery optimization is off for the app, so background syncing is uninterrupted."
                    else "Battery optimization is still enabled for the app. Please disable it to allow uninterrupted background syncing and reliable call updates.",
                    if (h.batteryUnrestricted) null else "Disable Battery Optimization" to onDisableBattery)
                h.lastSync?.let { Text("Last sync: $it", style = Txt.Body.copy(fontSize = 15.sp), color = Pal.textSecondary) }
                OutlineButton("Sync now", onSyncNow, Modifier.fillMaxWidth(), height = 56.dp)
                Text("Missing a call on the dashboard? This looks through the last 7 days of calls on this phone, uploads any that are missing, and tells you why if one cannot be uploaded.",
                    style = Txt.Body.copy(fontSize = 15.sp), color = Pal.textSecondary)
                OutlineButton(if (recheckBusy) "Checking…" else "Check last 7 days", { if (!recheckBusy) onRecheck() }, Modifier.fillMaxWidth(), height = 56.dp)
                if (recheckText != null) Text(recheckText, style = Txt.Body.copy(fontSize = 15.sp, lineHeight = 22.sp), color = Pal.text)
            }
            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun StatusItem(ok: Boolean, title: String, icon: ImageVector, body: String, action: Pair<String, () -> Unit>?) {
    val ring = if (ok) Color(0xFF4CAF14) else Color(0xFFE00000)
    Row(verticalAlignment = Alignment.Top) {
        Box(Modifier.size(80.dp).clip(CircleShape).border(5.dp, ring, CircleShape).padding(7.dp).clip(CircleShape).background(if (ok) Color(0xFF3F9E12) else Color(0xFFFFEDED)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = if (ok) Color.White else Color(0xFFE00000), modifier = Modifier.size(38.dp))
        }
        Spacer(Modifier.width(20.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = Txt.Title.copy(fontSize = 22.sp), color = Pal.text)
            Spacer(Modifier.height(8.dp))
            Text(body, style = Txt.BodyRoboto.copy(fontSize = 18.sp, lineHeight = 26.sp), color = if (ok) Color(0xFF8A94A8) else Color(0xFFD63A1E))
            if (action != null) {
                Spacer(Modifier.height(14.dp))
                Box(Modifier.clip(RoundedCornerShape(6.dp)).background(CallioColors.Danger).clickable(onClick = action.second).padding(horizontal = 26.dp, vertical = 14.dp)) {
                    Text(action.first, style = Txt.Title.copy(fontSize = 19.sp), color = Color.White)
                }
            }
        }
    }
}

/* ───────────────────────────── feature info screens ───────────────────────────── */

@Composable
fun ToggleInfoScreen(title: String, rowIcon: @Composable () -> Unit, rowLabel: String, on: Boolean, onToggle: (Boolean) -> Unit, warning: String?, heading: String, bullets: List<String>, onBack: () -> Unit, extra: (@Composable () -> Unit)? = null) {
    FullScreen {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            TopBar(title, onBack)
            if (warning != null) InfoLine(warning)
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(18.dp)).background(Pal.card).padding(horizontal = 16.dp, vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(36.dp), contentAlignment = Alignment.Center) { rowIcon() }
                Spacer(Modifier.width(14.dp))
                Text(rowLabel, style = Txt.Section.copy(fontSize = 22.sp), color = Pal.text, modifier = Modifier.weight(1f))
                SwitchPill(on, onToggle)
            }
            if (extra != null) { Spacer(Modifier.height(14.dp)); extra() }
            Spacer(Modifier.height(28.dp))
            Text(heading, style = Txt.Section.copy(fontSize = 22.sp), color = Pal.text, modifier = Modifier.padding(horizontal = 16.dp))
            Spacer(Modifier.height(10.dp))
            Column(Modifier.padding(horizontal = 16.dp)) { bullets.forEach { BulletText(it) } }
            Spacer(Modifier.height(60.dp))
        }
    }
}

/**
 * Where Callio looks for the phone's own call recordings. With no folder chosen it searches the phone's audio library by itself;
 * choosing the folder the phone's recorder saves into makes it find recordings that library search misses.
 */
@Composable
fun RecordingFolderCard(folderName: String?, onChoose: () -> Unit, onClear: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(18.dp)).background(Pal.card).padding(16.dp)) {
        Text("Recording folder", style = Txt.Section.copy(fontSize = 20.sp), color = Pal.text)
        Spacer(Modifier.height(6.dp))
        Text(
            if (folderName == null) "Not chosen. Callio looks for call recordings in your phone's audio library by itself."
            else "Callio looks here for new call recordings and uploads them to your dashboard:",
            style = Txt.Tab.copy(fontSize = 15.sp), color = Pal.textSecondary,
        )
        if (folderName != null) {
            Spacer(Modifier.height(8.dp))
            Text(folderName, style = Txt.Section.copy(fontSize = 17.sp), color = Pal.text)
        }
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PrimaryButton(if (folderName == null) "Choose folder" else "Change folder", onChoose, Modifier.weight(1f), height = 52.dp, corner = 14.dp)
            if (folderName != null) OutlineButton("Use automatic", onClear, Modifier.weight(1f), height = 52.dp, corner = 14.dp)
        }
    }
}

val CALL_RECORDING_BULLETS = listOf(
    "To hear both voices, turn on call recording in your phone's own Phone app. Callio finds that recording after the call and uploads it to your team's workspace.",
    "That needs Callio's permission to read audio files, and works only while your phone's own Phone app (not Callio) is the default phone app.",
    "If Callio is your default phone app, it records through the microphone instead. Android lets apps record the microphone only, so the other person is heard only when the call is on speaker.",
    "If your phone saves recordings somewhere Callio does not look, choose that folder above (on most phones it is called Recordings, Call or Call_rec). Callio then uploads each new recording to the matching call automatically.",
    "Only calls to leads assigned to you are recorded or uploaded. Other calls never are.",
    "Always tell the person you are calling that the call is being recorded.",
)

val QUICK_ACTION_BULLETS = listOf(
    "Callio's quick action is designed to give you instant access to essential call actions and insights — right when you need them most.",
    "Once a call begins, the quick action appears on your screen. Tapping it opens up two smart options:",
    "Save Contact – If the number isn't saved on your device, you can add it to your contacts with a single tap.",
    "View Details – Instantly access Callio's in-depth call history and analytics for the on-going call.",
)

val NOTE_POPUP_BULLETS = listOf(
    "When a call you spoke on ends, Callio shows a notification with a box to write what was discussed.",
    "Type the note and send — it is saved on that call and appears under it in Call History. Saving notes is part of the Premium Plus plan.",
    "If nothing appears: allow Notifications for Callio, and make sure the Phone permission is on (More → Troubleshooting → Call Sync).",
)

val WHATSAPP_BULLETS = listOf(
    "We can only see your WhatsApp call history if you allow us to access notifications.",
    "We cannot retrieve your past WhatsApp calls.",
    "We cannot handle rejected calls; they will be shown as missed calls instead.",
    "We cannot manage incoming group calls or waiting calls, which may cause the duration of ongoing calls to be incorrect.",
    "If you switch between audio and video mode during a WhatsApp call, the notification will appear when you switch, not when you end the call. Also, the call duration may be incorrect.",
    "WhatsApp Call Logs won't appear when a call link is created and both parties join the call.",
)

@Composable
fun TextInfoScreen(title: String, body: List<String>, buttonLabel: String? = null, onButton: () -> Unit = {}, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            TopBar(title, onBack)
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
                body.forEach { Text(it, style = Txt.Body.copy(fontSize = 19.sp, lineHeight = 28.sp), color = Pal.text, modifier = Modifier.padding(vertical = 8.dp)) }
            }
            if (buttonLabel != null) PrimaryButton(buttonLabel, onButton, Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 16.dp), height = 66.dp)
        }
    }
}

/* ───────────────────────────── reminders ───────────────────────────── */

@Composable
fun RemindersScreen(items: List<Reminder>, askAfterMissed: Boolean, onAsk: (Boolean) -> Unit, onAdd: () -> Unit, onDone: (Reminder) -> Unit, onCall: (String) -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            TopBar(T("missed_reminder"), onBack)
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).clip(RoundedCornerShape(16.dp)).background(Pal.card).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Ask me after a missed call", style = Txt.Body.copy(fontSize = 18.sp), color = Pal.text, modifier = Modifier.weight(1f))
                SwitchPill(askAfterMissed, onAsk)
            }
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (items.isEmpty()) Text("No reminders yet. Add one to be reminded to call someone back.", style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.padding(vertical = 24.dp))
                items.forEach { r ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Pal.card).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(r.contact_name?.takeIf { it.isNotBlank() } ?: r.phone_number, style = Txt.Name, color = Pal.text)
                            Text(r.note, style = Txt.Body.copy(fontSize = 15.sp), color = Pal.textSecondary)
                            r.remind_at?.let { Text(com.levoy.app.util.Fmt.parse(it)?.let { z -> "${com.levoy.app.util.Fmt.dateMed(z)} ${com.levoy.app.util.Fmt.time(z)}" } ?: "", style = Txt.Small, color = Pal.textMuted) }
                        }
                        Icon(Icons.Filled.Call, "Call", tint = CallioColors.Link, modifier = Modifier.size(40.dp).clickable { onCall(r.phone_number) }.padding(6.dp))
                        Icon(Icons.Filled.Check, "Done", tint = CallioColors.Success, modifier = Modifier.size(40.dp).clickable { onDone(r) }.padding(6.dp))
                    }
                }
            }
            PrimaryButton("Add reminder", onAdd, Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 16.dp), height = 66.dp)
        }
    }
}

@Composable
fun AddReminderDialog(phone: String, note: String, onPhone: (String) -> Unit, onNote: (String) -> Unit, onCancel: () -> Unit, onSave: () -> Unit) {
    DialogCard {
        Text("Write a reminder", style = Txt.Section.copy(fontSize = 22.sp), color = Pal.text)
        Spacer(Modifier.height(16.dp))
        Field(phone, onPhone, "Phone number", keyboard = KeyboardType.Phone)
        Spacer(Modifier.height(14.dp))
        Field(note, onNote, "Note (e.g. call back at 5 pm)")
        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            OutlineButton("Cancel", onCancel, Modifier.weight(1f), height = 58.dp)
            PrimaryButton("Add", onSave, Modifier.weight(1f), height = 58.dp, corner = 16.dp)
        }
    }
}

/* ───────────────────────────── delete account ───────────────────────────── */

@Composable
fun DeleteAccountScreen(email: String, error: String?, busy: Boolean, onEmail: (String) -> Unit, onDelete: () -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            TopBar("Delete Account", onBack)
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
                Text("This permanently deletes your account and the call history stored for it on the server. Calls on this phone are not touched.", style = Txt.Body.copy(fontSize = 19.sp, lineHeight = 28.sp), color = Pal.text)
                Spacer(Modifier.height(14.dp))
                Text("You cannot delete the only admin, or an account that still owns leads — reassign them first.", style = Txt.Body.copy(fontSize = 16.sp), color = Pal.textSecondary)
                Spacer(Modifier.height(28.dp))
                Field(email, onEmail, "Type your email to confirm", keyboard = androidx.compose.ui.text.input.KeyboardType.Email)
                if (error != null) Text(error, style = Txt.Body.copy(fontSize = 15.sp), color = CallioColors.DangerText, modifier = Modifier.padding(top = 12.dp))
            }
            Box(Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 16.dp).height(66.dp).clip(RoundedCornerShape(20.dp)).background(CallioColors.Danger).clickable(enabled = !busy && email.isNotBlank(), onClick = onDelete), contentAlignment = Alignment.Center) {
                Text(if (busy) "Deleting…" else "Delete my account", style = Txt.Button, color = Color.White)
            }
        }
    }
}
