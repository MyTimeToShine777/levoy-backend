package com.levoy.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallMade
import androidx.compose.material.icons.filled.CallMissed
import androidx.compose.material.icons.filled.CallReceived
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Dialpad
import androidx.compose.material.icons.filled.FilterAlt
import androidx.compose.material.icons.filled.PhoneCallback
import androidx.compose.material.icons.filled.PhoneDisabled
import androidx.compose.material.icons.filled.PhoneForwarded
import androidx.compose.material.icons.filled.PhoneMissed
import androidx.compose.material.icons.filled.SimCard
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.levoy.app.data.AttemptGroup
import com.levoy.app.data.CallKind
import com.levoy.app.data.CallRow
import com.levoy.app.ui.ActionIcons
import com.levoy.app.ui.FullScreen
import com.levoy.app.ui.IconAction
import com.levoy.app.ui.KindCircle
import com.levoy.app.ui.PermissionBanner
import com.levoy.app.ui.RootTitle
import com.levoy.app.ui.ScrollTabs
import com.levoy.app.ui.SearchField
import com.levoy.app.ui.TabDef
import com.levoy.app.ui.theme.LevoyColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt
import com.levoy.app.util.Fmt
import com.levoy.app.util.T

data class CallHistoryUi(
    val tab: String = "all",
    val rows: List<CallRow> = emptyList(),
    val groups: List<AttemptGroup> = emptyList(),
    val search: String = "",
    val showBanner: Boolean = true,
    val loading: Boolean = false,
    val error: String? = null,
)

class CallActions(
    val onCopy: (String) -> Unit = {}, val onSms: (String) -> Unit = {}, val onWhatsApp: (String) -> Unit = {}, val onCall: (String) -> Unit = {},
)

class CallHistoryActions(
    val onTab: (String) -> Unit = {}, val onSearch: (String) -> Unit = {}, val onFilter: () -> Unit = {}, val onExcel: () -> Unit = {},
    val onFix: () -> Unit = {}, val onNote: (CallRow) -> Unit = {}, val onDial: () -> Unit = {}, val onOpenContact: (String) -> Unit = {},
    val onRetry: () -> Unit = {}, val call: CallActions = CallActions(),
)

fun callTabs(): List<TabDef> {
    fun ic(v: ImageVector): @Composable (Color) -> Unit = { tint -> Icon(v, null, tint = tint, modifier = Modifier.size(24.dp)) }
    return listOf(
        TabDef("all", T("tab_all"), ic(Icons.Filled.Call), Color.Unspecified),
        TabDef("incoming", T("tab_incoming"), ic(Icons.Filled.PhoneCallback), LevoyColors.Incoming),
        TabDef("outgoing", T("tab_outgoing"), ic(Icons.Filled.PhoneForwarded), LevoyColors.Outgoing),
        TabDef("missed", T("tab_missed"), ic(Icons.Filled.PhoneMissed), LevoyColors.Missed),
        TabDef("rejected", T("tab_rejected"), ic(Icons.Filled.PhoneDisabled), LevoyColors.RejectedText),
        TabDef("never_attended", T("tab_never"), ic(Icons.Filled.PhoneCallback), LevoyColors.RejectedText),
        TabDef("not_pickup", T("tab_notpickup"), ic(Icons.Filled.PhoneForwarded), LevoyColors.RejectedText),
    ).map { t -> if (t.tint == Color.Unspecified) t.copy(icon = { _ -> Icon(Icons.Filled.Call, null, tint = Pal.text, modifier = Modifier.size(24.dp)) }) else t }
}

@Composable
fun CallHistoryScreen(ui: CallHistoryUi, a: CallHistoryActions, bottomInset: androidx.compose.ui.unit.Dp = 0.dp) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            RootTitle(T("nav_history")) {
                IconAction(Icons.Filled.FilterAlt, "Filter", onClick = a.onFilter)
                IconAction(Icons.Filled.TableChart, "Export", tint = Pal.text, onClick = a.onExcel)
            }
            if (ui.showBanner) PermissionBanner(a.onFix, Modifier.padding(horizontal = 16.dp))
            Spacer(Modifier.height(16.dp))
            ScrollTabs(callTabs(), ui.tab, a.onTab)
            Spacer(Modifier.height(10.dp))
            SearchField(ui.search, a.onSearch, T("search"), Modifier.padding(horizontal = 16.dp))
            Spacer(Modifier.height(8.dp))

            val grouped = ui.tab == "never_attended" || ui.tab == "not_pickup"
            when {
                ui.error != null -> CenterMessage(ui.error, "Retry", a.onRetry)
                ui.loading && ui.rows.isEmpty() && ui.groups.isEmpty() -> CenterMessage("Loading…")
                grouped -> if (ui.groups.isEmpty()) CenterMessage("Nothing to chase here") else GroupedList(ui, a, bottomInset)
                ui.rows.isEmpty() -> CenterMessage("No calls found")
                else -> CallList(ui, a, bottomInset)
            }
        }
    }
}

@Composable
private fun CenterMessage(text: String, action: String? = null, onAction: () -> Unit = {}) {
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(text, style = Txt.Body, color = Pal.textSecondary, textAlign = TextAlign.Center)
        if (action != null) {
            Spacer(Modifier.height(16.dp))
            Text(action, style = Txt.Button, color = LevoyColors.Amber, modifier = Modifier.clickable(onClick = onAction).padding(12.dp))
        }
    }
}

@Composable
private fun CallList(ui: CallHistoryUi, a: CallHistoryActions, bottomInset: androidx.compose.ui.unit.Dp) {
    // group by local calendar day, newest first (the server already sorts)
    val days = ui.rows.groupBy { r -> Fmt.parse(r.timestamp)?.toLocalDate() }.entries.toList()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 120.dp + bottomInset)) {
        days.forEach { (day, rows) ->
            item(key = "h-$day") {
                val z = rows.firstNotNullOfOrNull { Fmt.parse(it.timestamp) }
                Text(if (z != null) Fmt.dayHeading(z, T("today"), T("yesterday")) else "", style = Txt.DateHeading, color = Pal.text, modifier = Modifier.padding(top = 14.dp, bottom = 12.dp))
            }
            items(rows, key = { it.id }) { r ->
                CallCard(r, a)
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

@Composable
fun CallCard(r: CallRow, a: CallHistoryActions) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Pal.card)) {
        Row(Modifier.fillMaxWidth().clickable { a.onOpenContact(r.phone_key) }.padding(start = 14.dp, end = 14.dp, top = 14.dp), verticalAlignment = Alignment.Top) {
            KindCircle(r.callKind)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(r.displayName, style = Txt.Name, color = Pal.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(2.dp))
                Text(r.phone_number, style = Txt.Number.copy(fontSize = 15.sp), color = Pal.text, maxLines = 1)
            }
            Text(Fmt.time(r.timestamp), style = Txt.Number.copy(fontSize = 15.sp), color = Pal.text, modifier = Modifier.padding(top = 20.dp, end = 14.dp))
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                SimBadge(r)
                Text(Fmt.duration(r.duration_seconds), style = Txt.Number.copy(fontSize = 15.sp), color = Pal.text)
            }
        }
        Spacer(Modifier.height(8.dp))
        ActionIcons(r.phone_number, { a.call.onCopy(r.phone_number) }, { a.call.onSms(r.phone_number) }, { a.call.onWhatsApp(r.phone_number) }, { a.call.onCall(r.phone_number) },
            Modifier.fillMaxWidth().padding(horizontal = 34.dp))
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth().background(Color(0xFF3B3C41)).clickable { a.onNote(r) }.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Description, null, tint = Pal.textMuted, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(12.dp))
            val note = r.notes?.takeIf { it.isNotBlank() }
            Text(note ?: T("tap_note"), style = Txt.Body.copy(fontSize = 15.sp), color = if (note != null) Pal.text else Pal.textMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** The little SIM-card glyph with the slot number, or the WhatsApp mark for WhatsApp calls. */
@Composable
fun SimBadge(r: CallRow) {
    if (r.source == "whatsapp") {
        com.levoy.app.ui.WhatsAppGlyph(Modifier.size(26.dp))
    } else {
        Box(Modifier.size(width = 26.dp, height = 30.dp), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.SimCard, null, tint = Pal.text, modifier = Modifier.size(30.dp))
            Text((r.sim_slot ?: 1).toString(), style = Txt.Small.copy(fontSize = 11.sp), color = Pal.background, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun GroupedList(ui: CallHistoryUi, a: CallHistoryActions, bottomInset: androidx.compose.ui.unit.Dp) {
    val notPickup = ui.tab == "not_pickup"
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 120.dp + bottomInset), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        items(ui.groups, key = { it.phone_key + it.phone_number }) { g ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Pal.card).padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(46.dp).clip(CircleShape).background(if (notPickup) LevoyColors.OutgoingIcon else LevoyColors.MissedIcon), contentAlignment = Alignment.Center) {
                        Icon(if (notPickup) Icons.Filled.PhoneForwarded else Icons.Filled.PhoneMissed, null, tint = Color(0xFF222328), modifier = Modifier.size(26.dp))
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f).clickable { a.onOpenContact(g.phone_key) }) {
                        Text(g.contact_name?.takeIf { it.isNotBlank() } ?: "Unknown", style = Txt.Name.copy(fontSize = 15.sp), color = Pal.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(g.phone_number, style = Txt.Number.copy(fontSize = 13.sp), color = Pal.text, maxLines = 1)
                    }
                    ActionIcons(g.phone_number, { a.call.onCopy(g.phone_number) }, { a.call.onSms(g.phone_number) }, { a.call.onWhatsApp(g.phone_number) }, { a.call.onCall(g.phone_number) }, Modifier.width(158.dp), iconSize = 30.dp)
                }
                g.attempts.forEachIndexed { i, at ->
                    Spacer(Modifier.height(12.dp))
                    val z = Fmt.parse(at.timestamp)
                    Row(Modifier.fillMaxWidth().padding(start = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${i + 1}", style = Txt.Small.copy(fontSize = 15.sp), color = Pal.text, modifier = Modifier.width(26.dp))
                        Text(Fmt.ago(at.timestamp), style = Txt.Number.copy(fontSize = 15.sp), color = Pal.text, modifier = Modifier.weight(1f))
                        Text(z?.let { Fmt.dateMed(it) } ?: "", style = Txt.Number.copy(fontSize = 15.sp), color = Pal.text, modifier = Modifier.weight(1.1f), textAlign = TextAlign.Center)
                        Text(Fmt.time(at.timestamp), style = Txt.Number.copy(fontSize = 15.sp), color = Pal.text, modifier = Modifier.weight(0.8f), textAlign = TextAlign.End)
                    }
                }
            }
        }
    }
}
