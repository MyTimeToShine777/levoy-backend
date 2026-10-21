package com.levoy.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.levoy.app.ui.AmberButton
import com.levoy.app.ui.FullScreen
import com.levoy.app.ui.OutlineButton
import com.levoy.app.ui.SwitchPill
import com.levoy.app.ui.TopBar
import com.levoy.app.ui.WhatsAppGlyph
import com.levoy.app.ui.theme.CallioColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt

/* ───────────────────────────── social icons on the More screen ───────────────────────────── */

enum class Social(val key: String, val label: String) {
    X("social_twitter", "X"), Instagram("social_instagram", "Instagram"), Facebook("social_facebook", "Facebook"),
    Telegram("social_telegram", "Telegram"), Reddit("social_reddit", "Reddit"),
}

/** The row of social buttons under the logo. Only the links the workspace admin filled in are shown. */
@Composable
fun SocialRow(links: Map<Social, String>, onOpen: (String) -> Unit) {
    if (links.isEmpty()) return
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterHorizontally)) {
        links.forEach { (s, url) ->
            Box(Modifier.size(width = 56.dp, height = 56.dp).clip(RoundedCornerShape(12.dp)).background(Pal.card).clickable { onOpen(url) }, contentAlignment = Alignment.Center) { SocialGlyph(s) }
        }
    }
}

@Composable
private fun SocialGlyph(s: Social) {
    val c = Pal.text
    val card = Pal.card
    when (s) {
        Social.X -> Text("𝕏", style = Txt.Title.copy(fontSize = 24.sp), color = c)
        Social.Facebook -> Text("f", style = Txt.Title.copy(fontSize = 32.sp, fontWeight = FontWeight.Bold), color = c)
        Social.Instagram -> Canvas(Modifier.size(28.dp)) {
            drawRoundRect(c, Offset(1f, 1f), Size(size.width - 2f, size.height - 2f), androidx.compose.ui.geometry.CornerRadius(size.width * 0.3f), style = Stroke(3.5f))
            drawCircle(c, size.width * 0.22f, center, style = Stroke(3.5f))
            drawCircle(c, 2.6f, Offset(size.width * 0.76f, size.height * 0.24f))
        }
        Social.Telegram -> Canvas(Modifier.size(32.dp)) {
            drawCircle(c, size.width / 2)
            val p = Path().apply {
                moveTo(size.width * 0.24f, size.height * 0.5f); lineTo(size.width * 0.78f, size.height * 0.27f); lineTo(size.width * 0.66f, size.height * 0.74f)
                lineTo(size.width * 0.5f, size.height * 0.6f); lineTo(size.width * 0.42f, size.height * 0.72f); lineTo(size.width * 0.4f, size.height * 0.58f); close()
            }
            drawPath(p, card)
        }
        Social.Reddit -> Canvas(Modifier.size(32.dp)) {
            drawCircle(c, size.width / 2)
            drawOval(card, Offset(size.width * 0.2f, size.height * 0.38f), Size(size.width * 0.6f, size.height * 0.4f))
            drawCircle(c, 2.6f, Offset(size.width * 0.38f, size.height * 0.55f)); drawCircle(c, 2.6f, Offset(size.width * 0.62f, size.height * 0.55f))
            drawCircle(c, 3f, Offset(size.width * 0.74f, size.height * 0.26f))
        }
    }
}

/* ───────────────────────────── Linked Quick Call Extension ───────────────────────────── */

@Composable
fun LinkedExtensionScreen(linked: Boolean, premium: Boolean, deviceName: String, canCall: Boolean, onToggle: (Boolean) -> Unit, onGrantCall: () -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            TopBar("Linked Quick Call Extension", onBack)
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(18.dp)).background(Pal.card).padding(horizontal = 16.dp, vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Computer, null, tint = Pal.text, modifier = Modifier.size(34.dp))
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text("Link this phone", style = Txt.Section.copy(fontSize = 21.sp), color = Pal.text)
                    Text(deviceName, style = Txt.Small, color = Pal.textSecondary)
                }
                SwitchPill(linked, onToggle)
            }
            if (!premium) Text("Quick Call is part of the Premium plan. You can link this phone now, but the browser is refused until the workspace is on Premium.", style = Txt.Body.copy(fontSize = 15.sp), color = CallioColors.Amber, modifier = Modifier.padding(16.dp))
            if (linked && !canCall) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
                    Text("Without the Phone permission the phone shows a “Tap to call” notification instead of dialling by itself.", style = Txt.Body.copy(fontSize = 15.sp), color = Pal.textSecondary)
                    Spacer(Modifier.height(10.dp))
                    OutlineButton("Allow calling", onGrantCall, Modifier.fillMaxWidth(), height = 54.dp)
                }
            }
            Spacer(Modifier.height(18.dp))
            Text("How it works :", style = Txt.Section.copy(fontSize = 22.sp), color = Pal.text, modifier = Modifier.padding(horizontal = 16.dp))
            Spacer(Modifier.height(8.dp))
            Column(Modifier.padding(horizontal = 16.dp)) {
                listOf(
                    "Install the Callio Quick Call extension in Chrome (Load unpacked → the chrome-extension folder).",
                    "Click the extension icon and sign in with the same account and server as this app.",
                    "Switch this phone on above. Keep the notification — it is what keeps the link alive.",
                    "Click any phone number on a web page, or select a number and choose “Call with Callio”. This phone dials it.",
                    "The dashboard's Call History and Contacts also have a “Dial on my phone” button.",
                ).forEach { BulletText(it) }
            }
            Spacer(Modifier.height(60.dp))
        }
    }
}

/* ───────────────────────────── Help & Support ───────────────────────────── */

@Composable
fun HelpScreen(whatsappSupport: String?, premium: Boolean, onWhatsApp: () -> Unit, onUpgrade: () -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            TopBar("Help & Support", onBack)
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
                listOf(
                    "Callio reads your phone's call log and shows it as call history, analytics and contacts.",
                    "Privacy: your call log is sent to your own workspace server only. It is never sold or shared. You can delete your account and its data from Settings → Delete Account.",
                    "Calls not showing? Open More → Troubleshooting → Call Sync and check the three items.",
                    "Names missing? Settings → Missing Call Details fills in names and SIMs for calls already uploaded.",
                ).forEach { Text(it, style = Txt.Body.copy(fontSize = 19.sp, lineHeight = 28.sp), color = Pal.text, modifier = Modifier.padding(vertical = 8.dp)) }
            }
            if (!whatsappSupport.isNullOrBlank()) Column(Modifier.padding(16.dp).padding(bottom = 16.dp)) {
                if (premium) Row(Modifier.fillMaxWidth().height(66.dp).clip(RoundedCornerShape(20.dp)).background(Color(0xFF128C3E)).clickable(onClick = onWhatsApp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                    WhatsAppGlyph(Modifier.size(34.dp), Color.White); Spacer(Modifier.width(12.dp)); Text("Chat with support on WhatsApp", style = Txt.Button, color = Color.White)
                } else {
                    Text("Quick support on WhatsApp is part of the Premium plan.", style = Txt.Body.copy(fontSize = 16.sp), color = Pal.textSecondary, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(10.dp)); AmberButton("See Premium", onUpgrade, Modifier.fillMaxWidth(), height = 58.dp)
                }
            }
        }
    }
}

/* ───────────────────────────── Missing Call Details ───────────────────────────── */

@Composable
fun MissingDetailsScreen(busy: Boolean, result: String?, onScan: () -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            TopBar("Missing Call Details", onBack)
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
                Text("Some calls may show as “Unknown” or without a SIM — for example when the contact was not readable at the time, or the SIM was not yet detected.", style = Txt.Body.copy(fontSize = 19.sp, lineHeight = 28.sp), color = Pal.text)
                Spacer(Modifier.height(14.dp))
                Text("Scanning looks again at the last 90 days of your calls to the leads assigned to you and fills in the missing names and SIMs. Other calls on this phone are never read. It never changes a name or SIM that is already there.", style = Txt.Body.copy(fontSize = 16.sp, lineHeight = 24.sp), color = Pal.textSecondary)
                if (result != null) Text(result, style = Txt.Body.copy(fontSize = 18.sp), color = CallioColors.Amber, modifier = Modifier.padding(top = 24.dp))
            }
            AmberButton(if (busy) "Scanning…" else "Scan now", { if (!busy) onScan() }, Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 16.dp), height = 66.dp)
        }
    }
}

/* ───────────────────────────── Blogs ───────────────────────────── */

@Composable
fun BlogsScreen(url: String?, onOpen: () -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            TopBar("Blogs", onBack)
            Column(Modifier.weight(1f).padding(16.dp)) {
                if (url.isNullOrBlank()) Text("Your workspace admin has not added a blog yet. They can add the link in the dashboard under Premium → Support & links.", style = Txt.Body.copy(fontSize = 19.sp, lineHeight = 28.sp), color = Pal.textSecondary)
                else Text("Tips and updates from your team.", style = Txt.Body.copy(fontSize = 19.sp), color = Pal.text)
            }
            if (!url.isNullOrBlank()) AmberButton("Open blog", onOpen, Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 16.dp), height = 66.dp)
        }
    }
}
