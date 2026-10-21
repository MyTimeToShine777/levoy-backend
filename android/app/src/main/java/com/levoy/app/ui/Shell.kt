package com.levoy.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Backspace
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContactPage
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Dialpad
import androidx.compose.material.icons.filled.Diamond
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.levoy.app.ui.theme.CallioColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt
import com.levoy.app.util.Preset
import com.levoy.app.util.T
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class Tab(val key: String) { History("history"), Leads("leads"), Analytics("analytics"), Premium("premium"), Contacts("contacts") }

@Composable
fun BottomBar(current: Tab, showPremium: Boolean, onSelect: (Tab) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp)).background(Pal.card).padding(top = 12.dp, bottom = 14.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        data class Item(val tab: Tab, val label: String, val icon: ImageVector, val tint: Color?)
        listOf(
            Item(Tab.History, T("nav_history"), Icons.Filled.Call, null),
            Item(Tab.Leads, "Leads", Icons.Filled.Groups, null),
            Item(Tab.Analytics, T("nav_analytics"), Icons.Filled.BarChart, null),
            Item(Tab.Premium, T("nav_premium"), Icons.Filled.Diamond, CallioColors.Amber),
            Item(Tab.Contacts, T("nav_contacts"), Icons.Filled.ContactPage, null),
        ).filter { showPremium || it.tab != Tab.Premium }.forEach { it ->
            BottomBarItem(Modifier.weight(1f), it.label, it.icon, it.tint, it.tab == current) { onSelect(it.tab) }
        }
    }
}

/** One tab of the bottom bar. The selected tab's icon grows a little and the colours ease in, so a change of tab is seen, not just snapped. */
@Composable
private fun BottomBarItem(modifier: Modifier, label: String, icon: ImageVector, tint: Color?, selected: Boolean, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val press = rememberPressScale(source, pressedScale = 0.92f)
    val grow by animateFloatAsState(if (selected) 1.12f else 1f, tween(180), label = "grow")
    val iconColor by animateColorAsState(tint ?: if (selected) Pal.text else Pal.textMuted, tween(180), label = "iconColor")
    val labelColor by animateColorAsState(if (selected) Pal.text else Pal.textSecondary, tween(180), label = "labelColor")
    Column(
        modifier.scaleTo(press).clickable(interactionSource = source, indication = LocalIndication.current, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, null, tint = iconColor, modifier = Modifier.size(32.dp).scaleTo(grow))
        Spacer(Modifier.height(4.dp))
        Text(label, style = Txt.NavLabel.copy(fontSize = 13.sp), color = labelColor, maxLines = 1)
    }
}

/** Our own upsell strip on the Free plan — the "ad" that Premium's ad-free experience removes. No third-party ads. */
@Composable
fun UpgradeBanner(onUpgrade: () -> Unit, onClose: () -> Unit) {
    Row(Modifier.fillMaxWidth().background(Color(0xFFFFF3D6)).clickable(onClick = onUpgrade).padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Diamond, null, tint = Color(0xFFB57A00), modifier = Modifier.size(26.dp))
        Spacer(Modifier.size(10.dp))
        Text("Go ad-free, back up your calls and unlock notes, groups and billing — try Premium free for 7 days", style = Txt.Small.copy(fontSize = 13.sp), color = Color(0xFF4A3A10), modifier = Modifier.weight(1f))
        Icon(Icons.Filled.Close, "Dismiss", tint = Color(0xFF4A3A10), modifier = Modifier.size(32.dp).clickable(onClick = onClose).padding(6.dp))
    }
}

@Composable
fun DialFab(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val source = remember { MutableInteractionSource() }
    val scale = rememberPressScale(source, pressedScale = 0.92f)
    Box(
        modifier.scaleTo(scale).size(66.dp).shadow(8.dp, CircleShape).clip(CircleShape).background(CallioColors.Amber)
            .clickable(interactionSource = source, indication = LocalIndication.current, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.Dialpad, "Dial", tint = Color(0xFF111111), modifier = Modifier.size(34.dp))
    }
}

/** Dim the screen and slide a rounded panel up from the bottom. Tapping the dim area dismisses it. */
@Composable
fun BoxScope.BottomSheet(onDismiss: () -> Unit, content: @Composable () -> Unit) {
    // The dim layer fades in and the panel slides up on the first frame. Tapping outside plays the way out first, then removes the sheet.
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    val scope = rememberCoroutineScope()
    val dismiss: () -> Unit = { if (shown) { shown = false; scope.launch { delay(180); onDismiss() } } }
    val dim by animateFloatAsState(if (shown) 0.55f else 0f, tween(200), label = "dim")
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = dim)).clickable(onClick = dismiss))
    AnimatedVisibility(
        shown, Modifier.align(Alignment.BottomCenter),
        enter = slideInVertically(tween(260, easing = FastOutSlowInEasing)) { it } + fadeIn(tween(200)),
        exit = slideOutVertically(tween(180)) { it } + fadeOut(tween(160)),
    ) {
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(Pal.card).clickable(enabled = false) {},
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(Modifier.padding(top = 10.dp, bottom = 6.dp).size(width = 32.dp, height = 4.dp).clip(RoundedCornerShape(2.dp)).background(Color.White.copy(alpha = 0.85f)))
            content()
        }
    }
}

@Composable
fun PresetSheetContent(selected: Preset, onPick: (Preset) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(bottom = 28.dp)) {
        Preset.entries.forEach { p ->
            Row(Modifier.fillMaxWidth().height(48.dp).clickable { onPick(p) }.padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(28.dp), contentAlignment = Alignment.Center) {
                    if (p == selected) Icon(Icons.Filled.Check, null, tint = CallioColors.Amber, modifier = Modifier.size(22.dp))
                }
                Spacer(Modifier.size(16.dp))
                Text(presetLabel(p), style = Txt.Row.copy(fontSize = 19.sp), color = Pal.text)
            }
        }
    }
}

fun presetLabel(p: Preset) = when (p) {
    Preset.Today -> T("today"); Preset.Yesterday -> T("yesterday"); Preset.Week -> T("week"); Preset.Month -> T("month")
    Preset.Year -> T("year"); Preset.Custom -> T("custom"); Preset.AllTime -> T("all_time")
}

private val DIAL_KEYS = listOf("1" to "", "2" to "ABC", "3" to "DEF", "4" to "GHI", "5" to "JKL", "6" to "MNO", "7" to "PQRS", "8" to "TUV", "9" to "WXYZ", "*" to "", "0" to "+", "#" to "")

@Composable
fun DialpadContent(number: String, onNumber: (String) -> Unit, onCall: (String) -> Unit, onWhatsApp: (String) -> Unit, onCopy: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 24.dp)) {
        Row(Modifier.fillMaxWidth().height(70.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.ContentCopy, "Copy", tint = Pal.text, modifier = Modifier.size(32.dp).clickable { onCopy(number) })
            Text(number, style = Txt.Section.copy(fontSize = 26.sp), color = Pal.text, modifier = Modifier.weight(1f).padding(horizontal = 12.dp), maxLines = 1, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Icon(Icons.Filled.Backspace, "Backspace", tint = Pal.text, modifier = Modifier.size(34.dp).clickable { onNumber(number.dropLast(1)) })
        }
        DIAL_KEYS.chunked(3).forEach { row ->
            Row(Modifier.fillMaxWidth().height(76.dp)) {
                row.forEach { (k, sub) ->
                    Column(Modifier.weight(1f).fillMaxSize().clickable { onNumber((number + k).take(20)) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text(k, style = Txt.Section.copy(fontSize = 30.sp), color = Pal.text)
                        if (sub.isNotEmpty() || k == "0") Text(if (k == "0") "+" else sub, style = Txt.Small.copy(fontSize = 10.sp), color = Pal.textSecondary)
                    }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { WhatsAppGlyph(Modifier.size(52.dp).clickable { onWhatsApp(number) }) }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                Box(Modifier.size(76.dp).clip(CircleShape).background(Color(0xFF0A8A0A)).clickable { onCall(number) }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Call, "Call", tint = Color.White, modifier = Modifier.size(36.dp))
                }
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Dialpad, null, tint = Pal.textSecondary, modifier = Modifier.size(36.dp)) }
        }
    }
}
