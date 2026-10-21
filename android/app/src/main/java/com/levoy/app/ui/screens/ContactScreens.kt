package com.levoy.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CallMade
import androidx.compose.material.icons.filled.CallMissed
import androidx.compose.material.icons.filled.CallReceived
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FilterAlt
import androidx.compose.material.icons.filled.GroupAdd
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.levoy.app.data.CallKind
import com.levoy.app.data.CallsAndDuration
import com.levoy.app.data.CompareRow
import com.levoy.app.data.ContactDetail
import com.levoy.app.data.ContactRow
import com.levoy.app.ui.SkeletonList
import com.levoy.app.ui.ActionIcons
import com.levoy.app.ui.AmberButton
import com.levoy.app.ui.ChartCard
import com.levoy.app.ui.Donut
import com.levoy.app.ui.FullScreen
import com.levoy.app.ui.GroupedBars
import com.levoy.app.ui.IconAction
import com.levoy.app.ui.IncomingColor
import com.levoy.app.ui.Legend
import com.levoy.app.ui.MissedColor
import com.levoy.app.ui.OutgoingColor
import com.levoy.app.ui.RejectedColor
import com.levoy.app.ui.ScrollTabs
import com.levoy.app.ui.SearchField
import com.levoy.app.ui.Slice
import com.levoy.app.ui.TabDef
import com.levoy.app.ui.TopBar
import com.levoy.app.ui.theme.LevoyColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt
import com.levoy.app.util.Fmt
import com.levoy.app.util.T

/* ───────────────────────────── contact list ───────────────────────────── */

data class ContactsUi(val rows: List<ContactRow> = emptyList(), val search: String = "", val loading: Boolean = false, val error: String? = null, val total: Int = 0)

class ContactsActions(
    val onSearch: (String) -> Unit = {}, val onOpen: (ContactRow) -> Unit = {}, val onAddToGroup: (ContactRow) -> Unit = {},
    val onRetry: () -> Unit = {}, val call: CallActions = CallActions(),
)

@Composable
fun ContactsScreen(ui: ContactsUi, a: ContactsActions) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            Spacer(Modifier.height(16.dp))
            SearchField(ui.search, a.onSearch, T("search_contacts"), Modifier.padding(horizontal = 16.dp))
            Spacer(Modifier.height(10.dp))
            when {
                ui.error != null -> Text(ui.error, style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.padding(32.dp).clickable(onClick = a.onRetry))
                ui.loading && ui.rows.isEmpty() -> SkeletonList(rows = 6)
                ui.rows.isEmpty() -> Text("No contacts yet", style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.padding(32.dp))
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 130.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    items(ui.rows, key = { it.phone_key }) { c -> ContactCard(c, a) }
                }
            }
        }
    }
}

@Composable
fun Avatar(name: String, size: androidx.compose.ui.unit.Dp = 52.dp) {
    Box(Modifier.size(size).clip(CircleShape).border(3.dp, LevoyColors.Amber, CircleShape).padding(4.dp).clip(CircleShape).background(Color(0xFF111111)), contentAlignment = Alignment.Center) {
        Text(name.trim().firstOrNull { it.isLetterOrDigit() }?.uppercase() ?: "?", style = Txt.Name.copy(fontSize = 22.sp), color = Color.White)
    }
}

@Composable
private fun ContactCard(c: ContactRow, a: ContactsActions) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Pal.card).clickable { a.onOpen(c) }.padding(14.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Avatar(c.contact_name?.takeIf { it.isNotBlank() } ?: c.phone_number.takeLast(2))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(c.contact_name?.takeIf { it.isNotBlank() } ?: "Unknown", style = Txt.Name.copy(fontSize = 17.sp), color = Pal.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(c.phone_number, style = Txt.Number.copy(fontSize = 14.sp), color = Pal.text, maxLines = 1)
            }
            Column(horizontalAlignment = Alignment.End) {
                Row(
                    Modifier.clip(RoundedCornerShape(24.dp)).border(1.5.dp, LevoyColors.Amber, RoundedCornerShape(24.dp)).clickable { a.onAddToGroup(c) }.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Add, null, tint = LevoyColors.Amber, modifier = Modifier.size(16.dp))
                    Text(c.groups.firstOrNull()?.name ?: T("add_to_group"), style = Txt.Body.copy(fontSize = 13.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = LevoyColors.Amber, maxLines = 1)
                }
                Spacer(Modifier.height(8.dp))
                Text("${T("total_calls")} : ${c.total_calls}", style = Txt.Body.copy(fontSize = 14.sp), color = Pal.text)
            }
        }
        Spacer(Modifier.height(10.dp))
        ActionIcons(c.phone_number, { a.call.onCopy(c.phone_number) }, { a.call.onSms(c.phone_number) }, { a.call.onWhatsApp(c.phone_number) }, { a.call.onCall(c.phone_number) }, Modifier.fillMaxWidth().padding(horizontal = 24.dp))
    }
}

/* ───────────────────────────── contact detail ───────────────────────────── */

data class ContactDetailUi(
    val detail: ContactDetail? = null, val tab: String = "summary", val durationMode: Boolean = false,
    val loading: Boolean = false, val error: String? = null, val title: String = "", val number: String = "",
)

class ContactDetailActions(
    val onBack: () -> Unit = {}, val onTab: (String) -> Unit = {}, val onDuration: (Boolean) -> Unit = {}, val onAddToGroup: () -> Unit = {},
    val onFilter: () -> Unit = {}, val onMore: () -> Unit = {}, val onNote: (Int) -> Unit = {},
)

@Composable
fun ContactDetailScreen(ui: ContactDetailUi, a: ContactDetailActions) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp, top = 8.dp), verticalAlignment = Alignment.Top) {
                IconAction(Icons.AutoMirrored.Filled.ArrowBack, "Back", onClick = a.onBack)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f).padding(top = 6.dp)) {
                    Text(ui.title, style = Txt.Title.copy(fontSize = 25.sp), color = Pal.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(ui.number, style = Txt.BodyRoboto.copy(fontSize = 16.sp), color = Pal.text)
                    Row(Modifier.clickable(onClick = a.onAddToGroup).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Add, null, tint = LevoyColors.Amber, modifier = Modifier.size(22.dp))
                        Text(ui.detail?.contact?.groups?.firstOrNull()?.name ?: T("add_to_group"), style = Txt.Body.copy(fontSize = 17.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = LevoyColors.Amber)
                    }
                }
                IconAction(Icons.Filled.FilterAlt, "Filter", onClick = a.onFilter)
                IconAction(Icons.Filled.MoreVert, "More", onClick = a.onMore)
            }
            val d = ui.detail
            Row(Modifier.fillMaxWidth().background(Color(0xFF3A3B3F)).padding(horizontal = 24.dp, vertical = 16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Column { Text(T("duration"), style = Txt.Body.copy(fontSize = 17.sp), color = Pal.textSecondary); Text(rangeText(d), style = Txt.Section.copy(fontSize = 20.sp), color = Pal.text) }
                Column(horizontalAlignment = Alignment.End) { Text("Total days", style = Txt.Body.copy(fontSize = 17.sp), color = Pal.textSecondary); Text("${d?.range?.total_days ?: 0} Days", style = Txt.Section.copy(fontSize = 20.sp), color = Pal.text) }
            }
            Spacer(Modifier.height(14.dp))
            ScrollTabs(listOf(TabDef("summary", T("summary")), TabDef("analysis", T("analysis")), TabDef("history", T("call_history_tab"))), ui.tab, a.onTab, scroll = false)
            when {
                ui.error != null -> Text(ui.error, style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.padding(32.dp))
                d == null -> Text("Loading…", style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.padding(32.dp))
                ui.tab == "summary" -> SummaryTab(d)
                ui.tab == "analysis" -> AnalysisTab(d, ui.durationMode, a.onDuration)
                else -> HistoryTab(d, a.onNote)
            }
        }
    }
}

private fun rangeText(d: ContactDetail?): String {
    val f = d?.range?.from?.let { Fmt.parse(it) } ?: return "-"
    val t = d.range.to.let { Fmt.parse(it) } ?: return Fmt.dayMonth(f)
    return "${Fmt.dayMonth(f)} - ${Fmt.dayMonth(t)}"
}

@Composable
private fun SummaryTab(d: ContactDetail) = SummaryBlock(d.summary)

/** The donut + Incoming / Outgoing / Missed / Rejected table, shared by the contact view and the export preview. */
@Composable
fun SummaryBlock(s: Map<String, CallsAndDuration>) {
    fun n(k: String) = s[k]?.calls ?: 0
    fun sec(k: String) = s[k]?.duration ?: 0
    Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(top = 14.dp, bottom = 40.dp)) {
        ChartCard {
            Legend(listOf("Incoming" to IncomingColor, "Outgoing" to OutgoingColor, "Missed" to MissedColor).let { l -> if (n("rejected") > 0) l + ("Rejected" to RejectedColor) else l })
            Spacer(Modifier.height(18.dp))
            Donut(listOf(Slice("Incoming", n("incoming"), IncomingColor), Slice("Outgoing", n("outgoing"), OutgoingColor), Slice("Missed", n("missed"), MissedColor), Slice("Rejected", n("rejected"), RejectedColor)),
                Modifier.fillMaxWidth().padding(horizontal = 24.dp))
        }
        Spacer(Modifier.height(24.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
            Spacer(Modifier.weight(1.1f)); Text(T("calls"), style = Txt.BodyRoboto.copy(fontSize = 17.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Pal.text, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            Text(T("duration"), style = Txt.BodyRoboto.copy(fontSize = 17.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Pal.text, modifier = Modifier.weight(1.3f), textAlign = TextAlign.Center)
        }
        listOf(Triple("Incoming", "incoming", LevoyColors.IncomingText), Triple("Outgoing", "outgoing", LevoyColors.OutgoingText), Triple("Missed", "missed", LevoyColors.MissedText), Triple("Rejected", "rejected", LevoyColors.RejectedText)).forEach { (label, k, color) ->
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(label, style = Txt.BodyRoboto.copy(fontSize = 19.sp), color = color, modifier = Modifier.weight(1.1f))
                Text(n(k).toString(), style = Txt.BodyRoboto.copy(fontSize = 19.sp), color = Pal.text, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                Text(if (k == "missed" || k == "rejected") "-" else com.levoy.app.util.Fmt.durationOrDash(sec(k)), style = Txt.BodyRoboto.copy(fontSize = 19.sp), color = Pal.text, modifier = Modifier.weight(1.3f), textAlign = TextAlign.Center)
            }
        }
        Box(Modifier.padding(horizontal = 12.dp, vertical = 6.dp).fillMaxWidth().height(1.dp).background(Pal.divider))
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(T("total"), style = Txt.BodyRoboto.copy(fontSize = 19.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Pal.text, modifier = Modifier.weight(1.1f))
            Text(n("total").toString(), style = Txt.BodyRoboto.copy(fontSize = 19.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Pal.text, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            Text(Fmt.duration(sec("total")), style = Txt.BodyRoboto.copy(fontSize = 19.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Pal.text, modifier = Modifier.weight(1.3f), textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun AnalysisTab(d: ContactDetail, durationMode: Boolean, onDuration: (Boolean) -> Unit) {
    Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(top = 14.dp, bottom = 40.dp)) {
        ChartCard {
            Legend(listOf("Incoming" to IncomingColor, "Outgoing" to OutgoingColor, "Missed" to MissedColor, "Rejected" to RejectedColor))
            Spacer(Modifier.height(18.dp))
            GroupedBars(d.analysis.series.buckets, d.analysis.series.unit, durationMode)
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                Text(T("phone_call"), style = if (!durationMode) Txt.TabActive else Txt.Tab, color = if (!durationMode) Pal.text else Pal.textSecondary, modifier = Modifier.clickable { onDuration(false) }.padding(10.dp))
                Spacer(Modifier.width(30.dp))
                Text(T("duration"), style = if (durationMode) Txt.TabActive else Txt.Tab, color = if (durationMode) Pal.text else Pal.textSecondary, modifier = Modifier.clickable { onDuration(true) }.padding(10.dp))
            }
        }
        Spacer(Modifier.height(24.dp))
        val lc = d.analysis.longest_call
        Text(T("longest_call"), style = Txt.BodyRoboto.copy(fontSize = 21.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Pal.text, modifier = Modifier.padding(horizontal = 12.dp))
        Spacer(Modifier.height(10.dp))
        Column(Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            KeyValue("Date", lc?.let { Fmt.parse(it.timestamp)?.let(Fmt::dateMed) } ?: "-")
            KeyValue("Call Type", lc?.kind?.replaceFirstChar { it.uppercase() } ?: "-")
            KeyValue("Duration", lc?.let { Fmt.duration(it.duration_seconds) } ?: "-")
        }
        Spacer(Modifier.height(22.dp))
        val ft = d.analysis.frequently_talked
        Text(T("frequently_talked"), style = Txt.BodyRoboto.copy(fontSize = 21.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Pal.text, modifier = Modifier.padding(horizontal = 12.dp))
        Spacer(Modifier.height(10.dp))
        Column(Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            KeyValue("Date", ft?.let { runCatching { java.time.LocalDate.parse(it.day).format(java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy", java.util.Locale.ENGLISH)) }.getOrDefault(it.day) } ?: "-")
            KeyValue("No of Calls", ft?.let { "${it.incoming} Incoming Calls\n${it.outgoing} Outgoing Calls\nTotal ${it.calls} Calls" } ?: "-")
        }
    }
}

@Composable
private fun HistoryTab(d: ContactDetail, onNote: (Int) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 40.dp)) {
        items(d.history, key = { it.id }) { h ->
            val z = Fmt.parse(h.timestamp)
            val (label, color) = when (h.callKind) {
                CallKind.incoming -> "Incoming" to LevoyColors.IncomingText
                CallKind.outgoing -> "Outgoing" to LevoyColors.OutgoingText
                CallKind.missed -> "Missed" to LevoyColors.MissedText
                CallKind.rejected -> "Rejected" to LevoyColors.RejectedText
            }
            Column {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.width(100.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(when (h.callKind) { CallKind.incoming -> Icons.Filled.CallReceived; CallKind.outgoing -> Icons.Filled.CallMade; else -> Icons.Filled.CallMissed }, null, tint = color, modifier = Modifier.size(24.dp))
                        Text(label, style = Txt.Body.copy(fontSize = 16.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = color)
                    }
                    Text(if (z != null) "${Fmt.dayHeading(z, "Today", "Yesterday")}\n${Fmt.time(z)}" else "", style = Txt.Body.copy(fontSize = 18.sp, lineHeight = 26.sp), color = Pal.text, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                    Text(Fmt.duration(h.duration_seconds), style = Txt.Body.copy(fontSize = 18.sp), color = Pal.text, modifier = Modifier.width(88.dp), textAlign = TextAlign.Center)
                    Icon(Icons.Filled.Description, "Note", tint = Pal.text, modifier = Modifier.size(32.dp).clickable { onNote(h.id) })
                }
                Box(Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(0.6.dp).background(Pal.divider))
            }
        }
    }
}


/* ───────────────────────────── compare ───────────────────────────── */

data class CompareUi(val rows: List<CompareRow> = emptyList(), val loading: Boolean = false)

@Composable
fun CompareScreen(ui: CompareUi, onAdd: () -> Unit, onRemove: (String) -> Unit, onBack: () -> Unit) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            TopBar(T("compare"), onBack)
            if (ui.rows.isEmpty()) {
                Column(Modifier.weight(1f).padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Icon(Icons.Filled.GroupAdd, null, tint = LevoyColors.Amber, modifier = Modifier.size(120.dp))
                    Spacer(Modifier.height(36.dp))
                    Text(T("compare_hint"), style = Txt.Body.copy(fontSize = 18.sp, lineHeight = 28.sp), color = Pal.text, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(28.dp))
                    AmberButton(T("add_contacts"), onAdd, Modifier.fillMaxWidth(), height = 68.dp)
                    Spacer(Modifier.height(120.dp))
                }
            } else {
                Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    val max = ui.rows.maxOf { it.calls }.coerceAtLeast(1)
                    ui.rows.forEach { r ->
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Pal.card).padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(r.contact_name?.takeIf { it.isNotBlank() } ?: "Unknown", style = Txt.Name.copy(fontSize = 18.sp), color = Pal.text)
                                    Text(r.phone_number, style = Txt.Number, color = Pal.textSecondary)
                                }
                                Text("✕", style = Txt.Section, color = Pal.textSecondary, modifier = Modifier.clickable { onRemove(r.phone_key) }.padding(8.dp))
                            }
                            Spacer(Modifier.height(10.dp))
                            Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(Pal.cardDeep)) {
                                Box(Modifier.fillMaxWidth(r.calls.toFloat() / max).height(10.dp).clip(RoundedCornerShape(5.dp)).background(LevoyColors.Amber))
                            }
                            Spacer(Modifier.height(10.dp))
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("${r.calls} calls", style = Txt.Body, color = Pal.text)
                                Text(Fmt.duration(r.duration), style = Txt.Body, color = Pal.text)
                            }
                            Spacer(Modifier.height(6.dp))
                            Text("In ${r.incoming} (${Fmt.duration(r.incoming_duration)}) · Out ${r.outgoing} (${Fmt.duration(r.outgoing_duration)}) · Missed ${r.missed + r.rejected}", style = Txt.Small, color = Pal.textSecondary)
                        }
                    }
                    if (ui.rows.size < 5) AmberButton(T("add_contacts"), onAdd, Modifier.fillMaxWidth(), height = 60.dp)
                }
            }
        }
    }
}
