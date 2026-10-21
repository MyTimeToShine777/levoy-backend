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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.levoy.app.ui.AmberButton
import com.levoy.app.ui.FullScreen
import com.levoy.app.ui.OutlineButton
import com.levoy.app.ui.theme.CallioColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt
import com.levoy.app.util.T

/** A flat illustration of a person at a desk, drawn in code (the reference uses a bitmap). */
@Composable
fun DeskIllustration(modifier: Modifier = Modifier, dim: Boolean = false) {
    val a = if (dim) 0.55f else 1f
    Canvas(modifier) {
        val w = size.width; val h = size.height
        fun c(v: Long) = Color(v).copy(alpha = a)
        drawLine(c(0xFF5A4A40), Offset(w * 0.02f, h * 0.7f), Offset(w * 0.72f, h * 0.7f), strokeWidth = h * 0.03f)
        drawRect(c(0xFF5A4A40), Offset(w * 0.07f, h * 0.7f), Size(w * 0.015f, h * 0.3f))
        drawRect(c(0xFF5A4A40), Offset(w * 0.67f, h * 0.7f), Size(w * 0.015f, h * 0.3f))
        // lamp
        drawLine(c(0xFF8A8A90), Offset(w * 0.2f, 0f), Offset(w * 0.2f, h * 0.17f), strokeWidth = 3f)
        drawArc(if (dim) c(0xFF50565C) else c(0xFFEEF2F5), 180f, 180f, true, Offset(w * 0.05f, h * 0.1f), Size(w * 0.3f, h * 0.15f))
        // books
        for (i in 0..3) drawRoundRect(c(0xFFD9C9BE), Offset(w * 0.08f, h * 0.56f - i * h * 0.035f), Size(w * 0.2f, h * 0.03f), CornerRadius(4f))
        // person
        drawRoundRect(c(0xFF1F4274), Offset(w * 0.4f, h * 0.45f), Size(w * 0.2f, h * 0.5f), CornerRadius(8f))
        drawRoundRect(c(0xFFFFB938), Offset(w * 0.37f, h * 0.2f), Size(w * 0.26f, h * 0.32f), CornerRadius(30f))
        drawCircle(c(0xFFF0A987), w * 0.075f, Offset(w * 0.5f, h * 0.13f))
        drawRoundRect(c(0xFF6B4A32), Offset(w * 0.43f, h * 0.05f), Size(w * 0.14f, h * 0.06f), CornerRadius(20f))
        drawRoundRect(c(0xFF2A2A30), Offset(w * 0.34f, h * 0.27f), Size(w * 0.05f, h * 0.07f), CornerRadius(6f))
        // plant
        drawRoundRect(c(0xFFE0922B), Offset(w * 0.8f, h * 0.88f), Size(w * 0.12f, h * 0.12f), CornerRadius(6f))
        drawOval(c(0xFF9CCF6E), Offset(w * 0.76f, h * 0.5f), Size(w * 0.2f, h * 0.42f))
        drawOval(c(0xFFB6D4E6), Offset(w * 0.7f, h * 0.62f), Size(w * 0.12f, h * 0.28f))
    }
}

@Composable
fun PrivacyScreen(onAgree: () -> Unit, onPolicy: () -> Unit) {
    var open by remember { mutableStateOf<Int?>(null) }
    val sections = listOf(
        "Data we process" to "Your call history (number, time, duration, type), the SIM it came from, and — if you allow it — contact names. Calls you place or receive are read from this phone's call log.",
        "How we use your data" to "To show your calls, analytics and reports to you and to the workspace you belong to, and to keep your call history backed up. We do not sell your data.",
        "Unnecessary permissions? We never ask for it" to "Callio asks only for the call log, phone state and (optionally) contacts. Everything else is optional and can be turned off in Settings.",
    )
    FullScreen {
        Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
            Spacer(Modifier.height(64.dp))
            Text("Your privacy is important to us", style = Txt.Heading.copy(fontSize = 26.sp), color = Pal.text)
            Spacer(Modifier.height(12.dp))
            Text(buildAnnotatedString {
                append("Please take time to review the key points of our ")
                pushStyle(SpanStyle(color = Color(0xFF2A9BE8), fontWeight = FontWeight.SemiBold)); append("Privacy Policy"); pop()
                append(" below.")
            }, style = Txt.Body.copy(fontSize = 19.sp), color = Pal.text, modifier = Modifier.clickable(onClick = onPolicy))
            Spacer(Modifier.height(36.dp))
            sections.forEachIndexed { i, (t, body) ->
                Column(Modifier.fillMaxWidth().clickable { open = if (open == i) null else i }.padding(vertical = 14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(t, style = Txt.Body.copy(fontSize = 20.sp, fontWeight = FontWeight.Medium), color = Pal.text, modifier = Modifier.weight(1f))
                        Icon(if (open == i) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown, null, tint = Pal.text, modifier = Modifier.size(32.dp))
                    }
                    if (open == i) Text(body, style = Txt.Body.copy(fontSize = 16.sp, lineHeight = 24.sp), color = Pal.textSecondary, modifier = Modifier.padding(top = 10.dp, end = 30.dp))
                }
            }
            Spacer(Modifier.weight(1f))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Pal.cardDeep).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Shield, null, tint = Pal.text, modifier = Modifier.size(32.dp))
                Spacer(Modifier.width(12.dp))
                Text(buildAnnotatedString { append("By continuing you agree to our  "); pushStyle(SpanStyle(fontWeight = FontWeight.Bold)); append("Privacy Policy."); pop() }, style = Txt.BodyRoboto.copy(fontSize = 18.sp), color = Pal.text)
            }
            Spacer(Modifier.height(16.dp))
            AmberButton(T("agree_continue"), onAgree, Modifier.fillMaxWidth(), height = 66.dp, corner = 22.dp)
            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
fun DefaultPhoneScreen(onAgree: () -> Unit, onSkip: () -> Unit, onPolicy: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
            DeskIllustration(Modifier.padding(top = 60.dp).fillMaxWidth(0.72f).height(250.dp))
            Spacer(Modifier.height(80.dp))
            Text("Set Default Phone App", style = Txt.Heading.copy(fontSize = 28.sp), color = Pal.text)
            Spacer(Modifier.height(20.dp))
            Text("By permitting, you accept to initiate calls through Callio application dialer when using this application.", style = Txt.Body.copy(fontSize = 18.sp, lineHeight = 26.sp), color = Pal.text, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 36.dp))
            Spacer(Modifier.height(40.dp))
            Row(Modifier.fillMaxWidth().padding(horizontal = 26.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                AmberButton(T("yes_agree"), onAgree, Modifier.weight(1f), height = 60.dp, corner = 14.dp)
                OutlineButton(T("skip"), onSkip, Modifier.weight(1f), height = 60.dp, corner = 14.dp)
            }
            Spacer(Modifier.height(36.dp))
            Text(T("privacy_policy"), style = Txt.Small.copy(fontSize = 15.sp, textDecoration = TextDecoration.Underline), color = Pal.text, modifier = Modifier.clickable(onClick = onPolicy).padding(8.dp))
        }
    }
}

@Composable
fun PermissionPrimerScreen(title: String, why: String, extra: String, uses: List<String>, buttonLabel: String, onAllow: () -> Unit, onPolicy: () -> Unit) {
    FullScreen {
        Box(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp).padding(bottom = 250.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                DeskIllustration(Modifier.padding(top = 50.dp).fillMaxWidth(0.6f).height(210.dp))
                Spacer(Modifier.height(40.dp))
                Text(title, style = Txt.Heading.copy(fontSize = 28.sp, lineHeight = 36.sp), color = Pal.text, textAlign = TextAlign.Center)
                Spacer(Modifier.height(26.dp))
                Column(Modifier.fillMaxWidth()) {
                    Text("Why we need this permission:", style = Txt.BodyRoboto.copy(fontSize = 21.sp, fontWeight = FontWeight.Bold), color = Pal.text)
                    Spacer(Modifier.height(10.dp))
                    Text(why, style = Txt.BodyRoboto.copy(fontSize = 19.sp, lineHeight = 27.sp), color = Pal.text)
                    Spacer(Modifier.height(10.dp))
                    Text(extra, style = Txt.BodyRoboto.copy(fontSize = 19.sp, fontWeight = FontWeight.Bold, lineHeight = 27.sp), color = Pal.text)
                    Spacer(Modifier.height(18.dp))
                    Text("What we use it for:", style = Txt.BodyRoboto.copy(fontSize = 21.sp, fontWeight = FontWeight.Bold), color = Pal.text)
                    uses.forEach { BulletText(it) }
                }
            }
            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Pal.background).padding(horizontal = 16.dp).padding(bottom = 28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                AmberButton(buttonLabel, onAllow, Modifier.fillMaxWidth(), height = 68.dp, corner = 22.dp)
                Spacer(Modifier.height(18.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Shield, null, tint = Pal.text, modifier = Modifier.size(30.dp))
                    Spacer(Modifier.width(10.dp))
                    Text("It is Secure!", style = Txt.Section.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold), color = Pal.text)
                }
                Text(T("privacy_policy"), style = Txt.Small.copy(fontSize = 15.sp, textDecoration = TextDecoration.Underline), color = Pal.text, modifier = Modifier.clickable(onClick = onPolicy).padding(12.dp))
            }
        }
    }
}

val CALL_LOG_USES = listOf("Show incoming, outgoing, missed and rejected calls", "Total calls and talk time per day, week and month", "Reports you can export and share")
val CONTACTS_USES = listOf("Display contact names instead of raw phone numbers", "Show who you talk to most", "Let you group the people you call")

@Composable
fun LoginScreen(
    email: String, code: String, codeSent: Boolean, resendIn: Int, busy: Boolean, error: String?,
    onEmail: (String) -> Unit, onCode: (String) -> Unit,
    onSend: () -> Unit, onVerify: () -> Unit, onResend: () -> Unit, onChangeEmail: () -> Unit,
    resending: Boolean = false,
) {
    FullScreen {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(Modifier.height(80.dp))
            CallioLogo(Modifier.size(110.dp))
            Spacer(Modifier.height(12.dp))
            Text("Callio", style = Txt.Title.copy(fontSize = 32.sp), color = Pal.text)
            Spacer(Modifier.height(8.dp))
            Text(if (codeSent) "Enter the 6-digit code sent to $email" else "Sign in with your workspace email", style = Txt.Body.copy(fontSize = 17.sp), color = Pal.textSecondary, textAlign = TextAlign.Center)
            Spacer(Modifier.height(44.dp))
            if (!codeSent) {
                Field(email, onEmail, "Email", keyboard = androidx.compose.ui.text.input.KeyboardType.Email)
            } else {
                Field(code, onCode, "6-digit code", keyboard = androidx.compose.ui.text.input.KeyboardType.Number)
            }
            if (error != null) Text(error, style = Txt.Body.copy(fontSize = 15.sp), color = CallioColors.DangerText, modifier = Modifier.padding(top = 14.dp), textAlign = TextAlign.Center)
            Spacer(Modifier.height(28.dp))
            if (!codeSent) {
                AmberButton(if (busy) "Sending code…" else "Send code", onSend, Modifier.fillMaxWidth(), height = 66.dp, corner = 22.dp, enabled = !busy && email.isNotBlank())
                Spacer(Modifier.height(12.dp))
                Text("We will email you a code. No password needed.", style = Txt.Small, color = Pal.textMuted, textAlign = TextAlign.Center)
            } else {
                AmberButton(if (busy && resending) "Sending a new code…" else if (busy) "Signing in…" else "Sign in", onVerify, Modifier.fillMaxWidth(), height = 66.dp, corner = 22.dp, enabled = !busy && code.length == 6)
                Spacer(Modifier.height(18.dp))
                Text(if (resendIn > 0) "Resend code in ${resendIn}s" else "Resend code", style = Txt.Small.copy(fontSize = 15.sp, textDecoration = if (resendIn > 0) TextDecoration.None else TextDecoration.Underline), color = if (resendIn > 0) Pal.textMuted else Pal.textSecondary, modifier = Modifier.clickable(enabled = resendIn == 0 && !busy, onClick = onResend).padding(8.dp))
                Text("Use a different email", style = Txt.Small.copy(fontSize = 15.sp, textDecoration = TextDecoration.Underline), color = Pal.textSecondary, modifier = Modifier.clickable(onClick = onChangeEmail).padding(8.dp))
            }
        }
    }
}
