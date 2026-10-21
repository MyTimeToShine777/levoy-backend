package com.levoy.app.ui.screens

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.SimCard
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.levoy.app.data.SimSeen
import com.levoy.app.ui.PrimaryButton
import com.levoy.app.ui.FullScreen
import com.levoy.app.ui.OutlineButton
import com.levoy.app.ui.TopBar
import com.levoy.app.ui.WhatsAppGlyph
import com.levoy.app.ui.theme.CallioColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt
import com.levoy.app.util.T

data class FilterState(
    val sim: String = "",               // "", "whatsapp" or a slot number
    val contactType: String = "",       // "", "saved", "unsaved"
    val notes: String = "",             // "", "with", "without"
    val tagId: String = "",
    val tagName: String = "",
)

data class FilterUi(
    val state: FilterState = FilterState(),
    val sims: List<SimSeen> = emptyList(),
    val rangeLabel: String = "",
    val presetLabel: String = "",
    val premiumPlus: Boolean = false,
    val contactMenuOpen: Boolean = false,
    val notesMenuOpen: Boolean = false,
)

class FilterActions(
    val onBack: () -> Unit = {}, val onSim: (String) -> Unit = {}, val onRange: () -> Unit = {}, val onContactMenu: () -> Unit = {},
    val onContactType: (String) -> Unit = {}, val onNotesMenu: () -> Unit = {}, val onNotes: (String) -> Unit = {}, val onTags: () -> Unit = {},
    val onReset: () -> Unit = {}, val onDone: () -> Unit = {}, val onUpgrade: () -> Unit = {},
)

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun FilterScreen(ui: FilterUi, a: FilterActions) {
    FullScreen {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().height(70.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                com.levoy.app.ui.IconAction(Icons.AutoMirrored.Filled.ArrowBack, "Back", onClick = a.onBack)
                Spacer(Modifier.width(10.dp))
                Text(T("history_filter"), style = Txt.Title.copy(fontFamily = Txt.Heading.fontFamily, fontSize = 26.sp), color = Pal.text)
            }
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
                Spacer(Modifier.height(8.dp))
                Text(T("sim_label"), style = Txt.Section.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold), color = Pal.text)
                Spacer(Modifier.height(14.dp))
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    SimChipBox(selected = ui.state.sim == "", onClick = { a.onSim("") }) {
                        Icon(Icons.Filled.ContentCopy, null, tint = Pal.text, modifier = Modifier.size(34.dp)); Spacer(Modifier.width(12.dp)); Text("All", style = Txt.Body, color = Pal.text)
                    }
                    ui.sims.filter { it.source == "sim" && it.slot != null }.forEach { s ->
                        SimChipBox(selected = ui.state.sim == s.slot.toString(), onClick = { a.onSim(s.slot.toString()) }) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Filled.SimCard, null, tint = Pal.text, modifier = Modifier.size(34.dp))
                                Text(s.slot.toString(), style = Txt.Small.copy(fontSize = 12.sp), color = Pal.background, modifier = Modifier.padding(top = 4.dp))
                            }
                            Spacer(Modifier.width(8.dp))
                            Text(s.label ?: "SIM ${s.slot}", style = Txt.Body.copy(fontSize = 13.sp), color = Pal.text, maxLines = 1)
                        }
                    }
                    if (ui.sims.any { it.source == "whatsapp" }) {
                        SimChipBox(selected = ui.state.sim == "whatsapp", onClick = { a.onSim("whatsapp") }) {
                            WhatsAppGlyph(Modifier.size(38.dp), Color(0xFF1E8E3E)); Spacer(Modifier.width(8.dp)); Text("WhatsApp Call", style = Txt.Body.copy(fontSize = 13.sp), color = Pal.text, maxLines = 1)
                        }
                    }
                }
                Spacer(Modifier.height(26.dp))
                Text(T("duration_label"), style = Txt.Section.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold), color = Pal.text)
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0xFF3A3C41)).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(ui.rangeLabel, style = Txt.Section.copy(fontSize = 18.sp), color = Pal.text, modifier = Modifier.weight(1f).padding(end = 12.dp))
                    Row(Modifier.width(132.dp).height(64.dp).clip(RoundedCornerShape(14.dp)).background(Pal.card).clickable(onClick = a.onRange).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(ui.presetLabel, style = Txt.Section.copy(fontSize = 16.sp), color = Pal.text, modifier = Modifier.weight(1f), maxLines = 1)
                        Icon(Icons.Filled.KeyboardArrowDown, null, tint = Pal.text, modifier = Modifier.size(26.dp))
                    }
                }
                Spacer(Modifier.height(26.dp))
                Text(T("contact_type"), style = Txt.Section.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold), color = Pal.text)
                Spacer(Modifier.height(14.dp))
                val ctLabel = mapOf("" to T("all_contacts"), "saved" to T("saved_contacts"), "unsaved" to T("unsaved_contacts"))
                Dropdown(ctLabel.getValue(ui.state.contactType), ui.contactMenuOpen, a.onContactMenu,
                    listOf("" to T("all_contacts"), "saved" to T("saved_contacts"), "unsaved" to T("unsaved_contacts")), ui.state.contactType, a.onContactType)
                Spacer(Modifier.height(22.dp))
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)).background(Color(0xFF333437)).padding(horizontal = 14.dp, vertical = 16.dp)) {
                    if (!ui.premiumPlus) {
                        Text(
                            buildAnnotatedString {
                                append("Please upgrade to the ")
                                pushStyle(SpanStyle(textDecoration = TextDecoration.Underline, fontWeight = FontWeight.Bold)); append("Premium Plus"); pop()
                                append(" plan to get benefits of these additional filters.")
                            },
                            style = Txt.Body.copy(fontSize = 17.sp, fontWeight = FontWeight.SemiBold), color = Pal.primary, modifier = Modifier.clickable(onClick = a.onUpgrade),
                        )
                        Spacer(Modifier.height(16.dp))
                    }
                    Text(T("call_notes"), style = Txt.Section.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold), color = Pal.text)
                    Spacer(Modifier.height(12.dp))
                    val nl = mapOf("" to T("all_notes"), "with" to "With Notes", "without" to "Without Notes")
                    Dropdown(nl.getValue(ui.state.notes), ui.notesMenuOpen, { if (ui.premiumPlus) a.onNotesMenu() else a.onUpgrade() },
                        listOf("" to T("all_notes"), "with" to "With Notes", "without" to "Without Notes"), ui.state.notes, a.onNotes, dim = !ui.premiumPlus)
                    Spacer(Modifier.height(20.dp))
                    Text(T("tags"), style = Txt.Section.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold), color = Pal.text)
                    Spacer(Modifier.height(12.dp))
                    Row(
                        Modifier.fillMaxWidth().height(60.dp).clip(RoundedCornerShape(10.dp)).background(Color(0xFF444549)).border(1.dp, Color(0xFF55565B), RoundedCornerShape(10.dp))
                            .clickable { if (ui.premiumPlus) a.onTags() else a.onUpgrade() }.padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(ui.state.tagName.ifEmpty { T("select_tags") }, style = Txt.Body.copy(fontSize = 17.sp), color = Pal.text, modifier = Modifier.weight(1f))
                        Icon(Icons.Filled.ChevronRight, null, tint = Pal.text, modifier = Modifier.size(30.dp))
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                OutlineButton(T("reset"), a.onReset, Modifier.weight(1f).height(72.dp), 18.dp)
                PrimaryButton(T("done"), a.onDone, Modifier.weight(1f), height = 72.dp, corner = 18.dp)
            }
        }
    }
}

@Composable
private fun SimChipBox(selected: Boolean, onClick: () -> Unit, content: @Composable () -> Unit) {
    Row(
        Modifier.width(150.dp).height(72.dp).clip(RoundedCornerShape(12.dp)).background(Pal.card)
            .border(if (selected) BorderStroke(1.5.dp, Pal.primary) else BorderStroke(0.dp, Color.Transparent), RoundedCornerShape(12.dp))
            .clickable(onClick = onClick).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) { content() }
}

@Composable
private fun Dropdown(label: String, open: Boolean, onToggle: () -> Unit, options: List<Pair<String, String>>, selected: String, onPick: (String) -> Unit, dim: Boolean = false) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(if (dim) Color(0xFF3F4045) else Pal.card).border(1.dp, if (dim) Color(0xFF55565B) else Pal.divider.copy(alpha = 0.6f), RoundedCornerShape(10.dp))) {
        Row(Modifier.fillMaxWidth().height(60.dp).clickable(onClick = onToggle).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = Txt.Body.copy(fontSize = 19.sp), color = Pal.text, modifier = Modifier.weight(1f))
            Icon(if (open) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown, null, tint = Pal.text, modifier = Modifier.size(30.dp))
        }
        if (open) options.forEach { (k, l) ->
            val on = k == selected
            Row(Modifier.fillMaxWidth().height(52.dp).background(if (on) Pal.background else Color.Transparent).clickable { onPick(k) }.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(l, style = Txt.Body.copy(fontSize = 19.sp), color = if (on) Pal.primary else Pal.text, modifier = Modifier.weight(1f))
                if (on) Icon(Icons.Filled.Check, null, tint = Pal.primary, modifier = Modifier.size(26.dp))
            }
        }
    }
}
