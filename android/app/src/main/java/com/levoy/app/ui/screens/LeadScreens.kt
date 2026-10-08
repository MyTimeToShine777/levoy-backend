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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.levoy.app.data.CallStatusOption
import com.levoy.app.data.LeadRow
import com.levoy.app.data.statusKeyOf
import com.levoy.app.ui.AmberButton
import com.levoy.app.ui.FullScreen
import com.levoy.app.ui.OutlineButton
import com.levoy.app.ui.RootTitle
import com.levoy.app.ui.SearchField
import com.levoy.app.ui.TopBar
import com.levoy.app.ui.theme.LevoyColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt

/* ───────────────────────────── leads list ───────────────────────────── */

data class LeadsUi(val leads: List<LeadRow>?, val search: String, val loading: Boolean, val error: String?, val notice: String?)

@Composable
fun LeadsScreen(ui: LeadsUi, onSearch: (String) -> Unit, onOpen: (LeadRow) -> Unit, onCall: (String) -> Unit, onRetry: () -> Unit, onBack: (() -> Unit)?) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            if (onBack == null) RootTitle("Leads") else TopBar("Leads", onBack)
            SearchField(ui.search, onSearch, "Search name, phone or email", Modifier.padding(horizontal = 16.dp))
            Spacer(Modifier.height(10.dp))
            ui.notice?.let {
                Text(it, style = Txt.Body.copy(fontSize = 15.sp), color = LevoyColors.OnAmber, modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(LevoyColors.Success).padding(12.dp))
                Spacer(Modifier.height(10.dp))
            }
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                when {
                    ui.error != null -> {
                        Text(ui.error, style = Txt.Body, color = LevoyColors.MissedText, modifier = Modifier.padding(vertical = 16.dp))
                        OutlineButton("Retry", onRetry, Modifier.fillMaxWidth(), height = 52.dp)
                    }
                    ui.leads == null -> Text("Loading leads…", style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.padding(vertical = 24.dp))
                    ui.leads.isEmpty() -> Text(if (ui.loading) "Loading leads…" else "No leads found.", style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.padding(vertical = 24.dp))
                    else -> ui.leads.forEach { LeadCard(it, onOpen, onCall) }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun LeadCard(l: LeadRow, onOpen: (LeadRow) -> Unit, onCall: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Pal.card).clickable { onOpen(l) }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(l.name, style = Txt.Name, color = Pal.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(l.phone, style = Txt.Number, color = Pal.textSecondary)
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip(l.call_status ?: "Not called yet", if (l.call_status == null) Pal.textMuted else LevoyColors.Amber)
                l.tier?.let { Chip(if (l.priority_score != null) "$it · ${l.priority_score}" else it, tierColor(it)) }
            }
        }
        Icon(Icons.Filled.Call, "Call", tint = LevoyColors.Link, modifier = Modifier.size(44.dp).clickable { onCall(l.phone) }.padding(8.dp))
    }
}

@Composable
private fun Chip(text: String, color: Color) {
    Text(text, style = Txt.Small.copy(fontSize = 12.sp), color = color, maxLines = 1, overflow = TextOverflow.Ellipsis,
        modifier = Modifier.clip(RoundedCornerShape(10.dp)).border(1.dp, color.copy(alpha = 0.6f), RoundedCornerShape(10.dp)).padding(horizontal = 10.dp, vertical = 4.dp))
}

private fun tierColor(tier: String): Color = when (tier) {
    "Hot" -> LevoyColors.Missed
    "Warm" -> LevoyColors.AmberOrange
    "Won" -> LevoyColors.Success
    else -> LevoyColors.Link
}

private fun stageLabel(stage: String?) = stage?.replaceFirstChar { it.uppercase() } ?: "—"

/* ───────────────────────────── edit lead ───────────────────────────── */

@Composable
fun EditLeadDialog(
    lead: LeadRow, statuses: List<CallStatusOption>, saving: Boolean, error: String?,
    onCancel: () -> Unit, onSave: (name: String, phone: String, email: String, callStatus: String?, priority: String, notes: String) -> Unit,
) {
    var name by remember { mutableStateOf(lead.name) }
    var phone by remember { mutableStateOf(lead.phone) }
    var email by remember { mutableStateOf(lead.email.orEmpty()) }
    var callStatus by remember { mutableStateOf(lead.call_status) }
    var priority by remember { mutableStateOf(lead.priority) }
    var notes by remember { mutableStateOf(lead.notes.orEmpty()) }
    var picking by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).imePadding(), contentAlignment = Alignment.Center) {
        // the full list gets the whole panel, so every status and the search box fit on any screen.
        // (No early `return` here: leaving a composable lambda half way crashes this Compose version.)
        if (picking) StatusPickerPanel(callStatus, statuses, onPick = { callStatus = it; picking = false }, onBack = { picking = false })
        else DialogCard(Modifier.padding(vertical = 36.dp).verticalScroll(rememberScrollState())) {
            Text("Edit Lead", style = Txt.Section.copy(fontSize = 22.sp), color = Pal.text)
            Spacer(Modifier.height(16.dp))
            Label("Name *"); Field(name, { name = it }, "Lead full name")
            Spacer(Modifier.height(12.dp))
            Label("Phone *"); Field(phone, { phone = it }, "+91 98765 43210", keyboard = KeyboardType.Phone)
            Spacer(Modifier.height(12.dp))
            Label("Email"); Field(email, { email = it }, "email@example.com", keyboard = KeyboardType.Email)
            Spacer(Modifier.height(12.dp))
            Label("Call status")
            Row(
                Modifier.fillMaxWidth().height(66.dp).clip(RoundedCornerShape(22.dp)).background(Pal.card).border(1.dp, Pal.divider.copy(alpha = 0.5f), RoundedCornerShape(22.dp))
                    .clickable { picking = true }.padding(horizontal = 20.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(callStatus ?: "(Not called yet)", style = Txt.Body.copy(fontSize = 19.sp), color = Pal.text, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Icon(Icons.Filled.ExpandMore, null, tint = Pal.text, modifier = Modifier.size(28.dp))
            }
            Text("Stage: " + stageLabel(if (callStatus == null) "new" else statuses.firstOrNull { statusKeyOf(it.name) == statusKeyOf(callStatus.orEmpty()) }?.stage ?: lead.status), style = Txt.Small, color = Pal.textMuted, modifier = Modifier.padding(top = 6.dp))
            Spacer(Modifier.height(12.dp))
            Label("Priority")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf("high" to "High", "normal" to "Normal", "low" to "Low").forEach { (k, label) ->
                    val on = priority == k
                    Text(
                        label, style = Txt.Body.copy(fontSize = 16.sp), color = if (on) LevoyColors.OnAmber else Pal.text,
                        modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(if (on) LevoyColors.Amber else Pal.card).clickable { priority = k }.padding(horizontal = 20.dp, vertical = 14.dp),
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            Label("Notes")
            Box(Modifier.fillMaxWidth().heightIn(min = 96.dp).clip(RoundedCornerShape(22.dp)).background(Pal.card).border(1.dp, Pal.divider.copy(alpha = 0.5f), RoundedCornerShape(22.dp)).padding(horizontal = 20.dp, vertical = 16.dp)) {
                if (notes.isEmpty()) Text("Context for the team…", style = Txt.Body.copy(fontSize = 19.sp), color = Pal.textSecondary)
                BasicTextField(notes, { notes = it.take(2000) }, textStyle = Txt.Body.copy(fontSize = 19.sp, color = Pal.text), cursorBrush = SolidColor(LevoyColors.Amber), modifier = Modifier.fillMaxWidth())
            }
            error?.let { Text(it, style = Txt.Body.copy(fontSize = 15.sp), color = LevoyColors.MissedText, modifier = Modifier.padding(top = 12.dp)) }
            Spacer(Modifier.height(18.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                OutlineButton("Cancel", { if (!saving) onCancel() }, Modifier.weight(1f), height = 56.dp)
                AmberButton(if (saving) "Saving…" else "Save", { if (!saving) onSave(name, phone, email, callStatus, priority, notes) }, Modifier.weight(1f), height = 56.dp, corner = 16.dp)
            }
        }
    }
}

@Composable
private fun Label(text: String) {
    Text(text, style = Txt.Small.copy(fontSize = 13.sp), color = Pal.textSecondary, modifier = Modifier.padding(start = 6.dp, bottom = 6.dp))
}

/** The Call status chooser: its own panel with a search box and every status, a check on the current one. */
@Composable
private fun StatusPickerPanel(current: String?, statuses: List<CallStatusOption>, onPick: (String?) -> Unit, onBack: () -> Unit) {
    var q by remember { mutableStateOf("") }
    DialogCard(Modifier.padding(vertical = 36.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Pal.text, modifier = Modifier.size(36.dp).clip(RoundedCornerShape(18.dp)).clickable(onClick = onBack).padding(4.dp))
            Spacer(Modifier.width(10.dp))
            Text("Call status", style = Txt.Section.copy(fontSize = 22.sp), color = Pal.text)
        }
        Spacer(Modifier.height(14.dp))
        Box(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, LevoyColors.Amber, RoundedCornerShape(14.dp)).padding(horizontal = 16.dp), contentAlignment = Alignment.CenterStart) {
            if (q.isEmpty()) Text("Search…", style = Txt.Body.copy(fontSize = 17.sp), color = Pal.textSecondary)
            BasicTextField(q, { q = it }, singleLine = true, textStyle = Txt.Body.copy(fontSize = 17.sp, color = Pal.text), cursorBrush = SolidColor(LevoyColors.Amber), modifier = Modifier.fillMaxWidth())
        }
        Spacer(Modifier.height(8.dp))
        Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState())) {
            val opts = listOf<String?>(null) + statuses.map { it.name }
            opts.filter { q.isBlank() || (it ?: "(Not called yet)").contains(q.trim(), ignoreCase = true) }.forEach { o ->
                val on = statusKeyOf(o.orEmpty()) == statusKeyOf(current.orEmpty())
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (on) LevoyColors.Amber.copy(alpha = 0.18f) else Color.Transparent).clickable { onPick(o) }.padding(horizontal = 14.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(o ?: "(Not called yet)", style = Txt.Body.copy(fontSize = 17.sp), color = Pal.text, modifier = Modifier.weight(1f))
                    if (on) Icon(Icons.Filled.Check, null, tint = LevoyColors.Amber, modifier = Modifier.size(24.dp))
                }
            }
        }
    }
}
