package com.levoy.app.ui.screens

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
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallMade
import androidx.compose.material.icons.filled.CallMissed
import androidx.compose.material.icons.filled.CallReceived
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Diamond
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.PhoneCallback
import androidx.compose.material.icons.filled.PhoneDisabled
import androidx.compose.material.icons.filled.PhoneForwarded
import androidx.compose.material.icons.filled.SimCard
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.levoy.app.data.Analysis
import com.levoy.app.data.Summary
import com.levoy.app.ui.ChartCard
import com.levoy.app.ui.FullScreen
import com.levoy.app.ui.GroupedBars
import com.levoy.app.ui.IconAction
import com.levoy.app.ui.IncomingColor
import com.levoy.app.ui.Legend
import com.levoy.app.ui.MissedColor
import com.levoy.app.ui.OutgoingColor
import com.levoy.app.ui.PermissionBanner
import com.levoy.app.ui.RangeStrip
import com.levoy.app.ui.RejectedColor
import com.levoy.app.ui.RootTitle
import com.levoy.app.ui.ScrollTabs
import com.levoy.app.ui.TabDef
import com.levoy.app.ui.WhatsAppGlyph
import com.levoy.app.ui.theme.LevoyColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt
import com.levoy.app.util.Fmt
import com.levoy.app.util.T

data class AnalyticsUi(
    val summary: Summary? = null,
    val analysis: Analysis? = null,
    val rangeLabel: String = "",
    val presetLabel: String = "",
    val view: String = "summary",
    val graphOpen: Boolean = true,
    val durationMode: Boolean = false,
    val simFilter: String = "",          // "" = all, "whatsapp", or a slot number
    val showBanner: Boolean = true,
    val loading: Boolean = false,
    val error: String? = null,
)

class AnalyticsActions(
    val onRange: () -> Unit = {}, val onView: (String) -> Unit = {}, val onGraphToggle: () -> Unit = {}, val onDuration: (Boolean) -> Unit = {},
    val onSim: (String) -> Unit = {}, val onFix: () -> Unit = {}, val onRetry: () -> Unit = {}, val onUpgrade: () -> Unit = {}, val onTile: (String) -> Unit = {},
)

@Composable
fun AnalyticsScreen(ui: AnalyticsUi, a: AnalyticsActions) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            RootTitle(T("nav_analytics")) {
                SimToggle(Icons.Filled.ContentCopy, ui.simFilter == "") { a.onSim("") }
                SimToggle(Icons.Filled.SimCard, ui.simFilter.isNotEmpty() && ui.simFilter != "whatsapp") { a.onSim("1") }
                SimToggle(null, ui.simFilter == "whatsapp") { a.onSim("whatsapp") }
            }
            if (ui.showBanner) PermissionBanner(a.onFix, Modifier.padding(horizontal = 16.dp))
            Spacer(Modifier.height(10.dp))
            RangeStrip(ui.rangeLabel, ui.presetLabel, a.onRange)
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(bottom = 110.dp)) {
                val s = ui.summary
                if (ui.error != null) {
                    Text(ui.error, style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.padding(32.dp), textAlign = TextAlign.Center)
                    Text("Retry", style = Txt.Button, color = LevoyColors.Amber, modifier = Modifier.align(Alignment.CenterHorizontally).clickable(onClick = a.onRetry).padding(12.dp))
                } else if (s == null) {
                    Text("Loading…", style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.padding(32.dp))
                } else {
                    Spacer(Modifier.height(16.dp))
                    GraphView(ui, s, a)
                    Spacer(Modifier.height(10.dp))
                    ScrollTabs(listOf(TabDef("summary", T("summary")), TabDef("analysis", T("analysis"))), ui.view, a.onView, scroll = false, modifier = Modifier.padding(horizontal = 40.dp))
                    Spacer(Modifier.height(10.dp))
                    if (ui.view == "summary") Tiles(s, a) else AnalysisBody(ui.analysis)
                }
            }
        }
    }
}

@Composable
private fun SimToggle(icon: ImageVector?, on: Boolean, onClick: () -> Unit) {
    Box(Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)).background(if (on) Pal.card else Color.Transparent).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        if (icon != null) Icon(icon, null, tint = Pal.text, modifier = Modifier.size(30.dp)) else WhatsAppGlyph(Modifier.size(32.dp), Pal.text)
    }
}

@Composable
private fun GraphView(ui: AnalyticsUi, s: Summary, a: AnalyticsActions) {
    Box(Modifier.padding(horizontal = 16.dp)) {
        ChartCard {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(T("graph_view"), style = Txt.Section.copy(fontSize = 22.sp), color = Pal.text, modifier = Modifier.weight(1f))
                Box(Modifier.size(58.dp).clip(CircleShape).background(Color.Black).clickable(onClick = a.onGraphToggle), contentAlignment = Alignment.Center) {
                    Icon(if (ui.graphOpen) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown, null, tint = Color.White, modifier = Modifier.size(32.dp))
                }
            }
            if (ui.graphOpen) {
                Spacer(Modifier.height(14.dp))
                Legend(listOf("Incoming" to IncomingColor, "Outgoing" to OutgoingColor, "Missed" to MissedColor, "Rejected" to RejectedColor))
                Spacer(Modifier.height(18.dp))
                GroupedBars(s.series.buckets, s.series.unit, ui.durationMode)
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                    GraphToggle(T("phone_call"), !ui.durationMode) { a.onDuration(false) }
                    Spacer(Modifier.width(40.dp))
                    GraphToggle(T("duration"), ui.durationMode) { a.onDuration(true) }
                }
            }
        }
    }
}

@Composable
private fun GraphToggle(label: String, on: Boolean, onClick: () -> Unit) {
    Column(Modifier.clickable(onClick = onClick).padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = if (on) Txt.TabActive.copy(fontSize = 18.sp) else Txt.Tab.copy(fontSize = 18.sp), color = if (on) Pal.text else Pal.textSecondary)
        Spacer(Modifier.height(6.dp))
        Box(Modifier.size(6.dp).clip(CircleShape).background(if (on) Pal.text else Pal.textMuted))
    }
}

@Composable
private fun Tiles(s: Summary, a: AnalyticsActions) {
    val locked = s.locked
    val wh = s.working
    val rows: List<List<Tile>> = listOf(
        listOf(
            Tile(T("total_phone_calls"), Icons.Filled.Call, Color(0xFFFFB020), s.totals.calls, s.totals.duration, tab = "all"),
            Tile(T("incoming_calls"), Icons.Filled.CallReceived, LevoyColors.Incoming, s.incoming.calls, s.incoming.duration, tab = "incoming"),
        ),
        listOf(
            Tile(T("outgoing_calls"), Icons.Filled.CallMade, LevoyColors.OutgoingText, s.outgoing.calls, s.outgoing.duration, tab = "outgoing"),
            Tile(T("missed_calls"), Icons.Filled.CallMissed, LevoyColors.MissedText, s.missed.calls, null, tab = "missed"),
        ),
        listOf(
            Tile(T("rejected_calls"), Icons.Filled.PhoneDisabled, LevoyColors.RejectedText, s.rejected.calls, null, tab = "rejected"),
            Tile(T("never_calls"), Icons.Filled.PhoneCallback, Color(0xFFE8E8EC), s.never_attended.calls, null, tab = "never_attended"),
        ),
        listOf(
            Tile(T("notpickup_calls"), Icons.Filled.PhoneForwarded, Color(0xFFFFB020), s.not_pickup.calls, null, tab = "not_pickup"),
            Tile(T("unique_calls"), Icons.Filled.Star, Color(0xFFE8E8EC), s.unique_calls ?: 0, null, premium = "unique_calls" in locked),
        ),
        listOf(
            Tile(T("connected_calls"), Icons.Filled.CheckCircle, Color(0xFFE8E8EC), s.connected_calls ?: 0, null, premium = "connected_calls" in locked),
            Tile(T("working_hours"), Icons.Filled.HourglassEmpty, Color(0xFF4A9EFF), null, wh?.totals?.working_seconds, premium = "working_hours" in locked, timerOnly = true),
        ),
        listOf(
            Tile(T("ideal_time"), Icons.Filled.Bedtime, Color(0xFFE8E8EC), null, wh?.totals?.idle_seconds, premium = "ideal_time" in locked, timerOnly = true),
        ),
    )
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        rows.forEach { r ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                r.forEach { t -> Box(Modifier.weight(1f)) { StatTile(t, a) } }
                if (r.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

private data class Tile(
    val title: String, val icon: ImageVector, val tint: Color, val calls: Int?, val seconds: Int?,
    val premium: Boolean = false, val tab: String? = null, val timerOnly: Boolean = false,
)

@Composable
private fun StatTile(t: Tile, a: AnalyticsActions) {
    val bg = if (t.premium) Color(0xFF38393D) else Pal.card
    Box(Modifier.fillMaxWidth().height(if (t.calls != null && t.seconds != null) 200.dp else 170.dp).clip(RoundedCornerShape(24.dp)).background(bg)
        .clickable { if (t.premium) a.onUpgrade() else t.tab?.let(a.onTile) }) {
        Column(Modifier.fillMaxSize().padding(start = 16.dp, end = 12.dp, top = if (t.premium) 40.dp else 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(t.icon, null, tint = t.tint, modifier = Modifier.size(46.dp))
                Spacer(Modifier.width(10.dp))
                Text(t.title, style = Txt.Tile, color = Pal.text, maxLines = 2)
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (t.calls != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (t.seconds != null) Icon(Icons.Filled.Call, null, tint = Pal.text, modifier = Modifier.size(28.dp).padding(end = 2.dp))
                        if (t.seconds != null) Spacer(Modifier.width(8.dp))
                        Text(t.calls.toString(), style = Txt.Stat, color = Pal.text)
                    }
                }
                if (t.seconds != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Timer, null, tint = Pal.text, modifier = Modifier.size(32.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(if (t.premium) "Xh Xm Xs" else Fmt.duration(t.seconds), style = Txt.Stat, color = Pal.text)
                    }
                }
            }
        }
        if (t.premium) {
            Row(
                Modifier.align(Alignment.TopEnd).clip(RoundedCornerShape(topEnd = 24.dp, bottomStart = 0.dp)).background(Color(0xFFFFA500)).padding(start = 22.dp, end = 12.dp, top = 6.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Diamond, null, tint = Color(0xFF2B2000), modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(4.dp))
                Text("Premium Plus", style = Txt.Small.copy(fontSize = 14.sp), color = Color(0xFF2B2000))
            }
        }
    }
}

@Composable
private fun AnalysisBody(a: Analysis?) {
    // `a == null` is handled before the layout: an early `return@Column` inside a composable crashes this Compose version
    if (a == null) { Text("Loading…", style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.padding(16.dp)); return }
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Pal.card).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("At a glance", style = Txt.Section, color = Pal.text)
            KeyValue("Average talk time", Fmt.duration(a.avg_connected_duration))
            KeyValue("Outgoing calls that connected", "${Math.round(a.outgoing_connect_rate)}%")
            val peak = a.by_hour.maxByOrNull { it.calls }
            KeyValue("Busiest hour", if (peak != null && peak.calls > 0) "${if (peak.hour % 12 == 0) 12 else peak.hour % 12}:00 ${if (peak.hour < 12) "AM" else "PM"}" else "-")
            a.longest_call?.let { KeyValue("Longest call", Fmt.duration(it.duration_seconds)) }
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Pal.card).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Most frequently called", style = Txt.Section, color = Pal.text)
            if (a.most_frequent.isEmpty()) Text("No calls in this range", style = Txt.Small, color = Pal.textSecondary)
            a.most_frequent.forEachIndexed { i, c ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${i + 1}", style = Txt.Small, color = Pal.textSecondary, modifier = Modifier.width(24.dp))
                    Column(Modifier.weight(1f)) {
                        Text(c.contact_name?.takeIf { it.isNotBlank() } ?: c.phone_number, style = Txt.Name.copy(fontSize = 15.sp), color = Pal.text, maxLines = 1)
                        if (!c.contact_name.isNullOrBlank()) Text(c.phone_number, style = Txt.Small, color = Pal.textSecondary)
                    }
                    Text("${c.calls} calls", style = Txt.Number, color = Pal.text)
                }
            }
        }
    }
}

@Composable
fun KeyValue(k: String, v: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(k, style = Txt.BodyRoboto.copy(fontSize = 17.sp), color = Pal.text, modifier = Modifier.weight(1f))
        Text(v, style = Txt.BodyRoboto.copy(fontSize = 17.sp), color = Pal.text, textAlign = TextAlign.End)
    }
}
