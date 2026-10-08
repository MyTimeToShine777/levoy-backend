package com.levoy.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Diamond
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallMade
import androidx.compose.material.icons.filled.CallMissed
import androidx.compose.material.icons.filled.CallReceived
import androidx.compose.material.icons.filled.PhoneDisabled
import androidx.compose.material.icons.filled.PhoneCallback
import androidx.compose.material.icons.filled.PhoneForwarded
import androidx.compose.material.icons.filled.PhoneMissed
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.levoy.app.ui.theme.LevoyColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt

/* ───────────────────────────── top bar ───────────────────────────── */

/** Back arrow + title, as on every secondary screen of the reference app. */
@Composable
fun TopBar(title: String, onBack: (() -> Unit)?, actions: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) {
            Box(Modifier.size(44.dp).clip(CircleShape).clickable(onClick = onBack), contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Pal.text, modifier = Modifier.size(26.dp))
            }
            Spacer(Modifier.width(8.dp))
        } else Spacer(Modifier.width(4.dp))
        Text(title, style = Txt.TopBar, color = Pal.text, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        actions()
    }
}

/** What the root titles need from the shell: how to open the side menu, and the plan badge ("Premium Plus") if the person is on a paid plan. */
class Chrome(val openMenu: (() -> Unit)? = null, val badge: String? = null)
val LocalChrome = androidx.compose.runtime.compositionLocalOf { Chrome() }

/** The gold tag shown for people on a paid plan. `compact` is just the diamond, for title rows that are already full. */
@Composable
fun PlanBadge(name: String, modifier: Modifier = Modifier, compact: Boolean = false) {
    Row(
        modifier.clip(RoundedCornerShape(12.dp)).background(LevoyColors.Amber.copy(alpha = 0.16f)).border(1.dp, LevoyColors.Amber, RoundedCornerShape(12.dp))
            .padding(horizontal = if (compact) 6.dp else 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Diamond, name, tint = LevoyColors.Amber, modifier = Modifier.size(if (compact) 18.dp else 14.dp))
        if (!compact) {
            Spacer(Modifier.width(5.dp))
            Text(name, style = Txt.Small.copy(fontSize = 12.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = LevoyColors.Amber, maxLines = 1)
        }
    }
}

/** Big bold screen title used on the root tabs ("Call History", "Analytics"), with the menu button on the left and the plan badge after the title. */
@Composable
fun RootTitle(title: String, actions: @Composable () -> Unit = {}) {
    val chrome = LocalChrome.current
    Row(Modifier.fillMaxWidth().height(68.dp).padding(start = 4.dp, end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        if (chrome.openMenu != null) IconAction(Icons.Filled.Menu, "Menu", onClick = chrome.openMenu) else Spacer(Modifier.width(12.dp))
        Spacer(Modifier.width(2.dp))
        // the title gives way first (ellipsis) if the badge and the buttons need the room
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = Txt.Title, color = Pal.text, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            chrome.badge?.let { PlanBadge(it, Modifier.padding(start = 8.dp), compact = true) }
        }
        actions()
    }
}

@Composable
fun IconAction(icon: ImageVector, desc: String, tint: Color = Pal.text, onClick: () -> Unit) {
    Box(Modifier.size(48.dp).clip(CircleShape).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, desc, tint = tint, modifier = Modifier.size(28.dp))
    }
}

/* ───────────────────────────── buttons ───────────────────────────── */

@Composable
fun AmberButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, height: Dp = 64.dp, corner: Dp = 20.dp, enabled: Boolean = true, upper: Boolean = false) {
    // A disabled button used to be the yellow at 40% with dark text, which was nearly unreadable. Now both states keep the same dark bold
    // text on yellow (disabled is only slightly softer), and the text stays on one line whatever the phone's font size.
    Box(
        modifier.height(height).clip(RoundedCornerShape(corner)).background(if (enabled) LevoyColors.Amber else LevoyColors.Amber.copy(alpha = 0.8f))
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            if (upper) text.uppercase() else text,
            style = Txt.Button.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold),
            color = Color(0xFF111111),
            maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun OutlineButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, height: Dp = 64.dp, corner: Dp = 16.dp) {
    Box(
        modifier.height(height).clip(RoundedCornerShape(corner)).border(BorderStroke(1.5.dp, Pal.text), RoundedCornerShape(corner)).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = Txt.Button, color = Pal.text) }
}

@Composable
fun DangerButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier.height(48.dp).clip(RoundedCornerShape(6.dp)).background(LevoyColors.Danger).clickable(onClick = onClick).padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = Txt.Button.copy(fontSize = 17.sp), color = Color.White) }
}

/* ───────────────────────────── surfaces ───────────────────────────── */

@Composable
fun Card(modifier: Modifier = Modifier, corner: Dp = 18.dp, color: Color = Pal.card, content: @Composable () -> Unit) {
    Box(modifier.clip(RoundedCornerShape(corner)).background(color)) { content() }
}

/** A white-on-card list row with an icon, used by the More menu. */
@Composable
fun MenuCard(icon: @Composable () -> Unit, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(54.dp).clip(RoundedCornerShape(14.dp)).background(Pal.card).clickable(onClick = onClick).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.dp), contentAlignment = Alignment.Center) { icon() }
        Spacer(Modifier.width(10.dp))
        Text(label, style = Txt.Row, color = Pal.text, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** A settings row: icon, label, chevron, hairline underneath. */
@Composable
fun SettingsRow(icon: @Composable () -> Unit, label: String, onClick: () -> Unit, trailing: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(32.dp), contentAlignment = Alignment.Center) { icon() }
            Spacer(Modifier.width(14.dp))
            Text(label, style = Txt.Row, color = Pal.text, modifier = Modifier.weight(1f))
            if (trailing != null) trailing() else Icon(Icons.Filled.ChevronRight, null, tint = Pal.text, modifier = Modifier.size(30.dp))
        }
        Box(Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(0.6.dp).background(Pal.divider))
    }
}

/** "12 hr / 24 hr" style single choice row with the amber check circle on the right. */
@Composable
fun ChoiceRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth().height(72.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = Txt.Row, color = Pal.text, modifier = Modifier.weight(1f))
            if (selected) {
                Box(Modifier.size(38.dp).clip(CircleShape).background(LevoyColors.Amber), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Check, null, tint = LevoyColors.OnAmber, modifier = Modifier.size(22.dp))
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(0.6.dp).background(Pal.divider))
    }
}

@Composable
fun SwitchPill(on: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.height(44.dp).clip(RoundedCornerShape(22.dp)).background(if (on) LevoyColors.Amber.copy(alpha = 0.25f) else Pal.cardDeep.copy(alpha = 0.6f))
            .clickable { onChange(!on) }.padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (on) { Text("ON", style = Txt.Small.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = LevoyColors.Amber, modifier = Modifier.padding(horizontal = 10.dp)) }
        Box(Modifier.size(32.dp).clip(CircleShape).background(if (on) LevoyColors.Amber else Color.White))
        if (!on) { Text("OFF", style = Txt.Small.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Pal.text, modifier = Modifier.padding(horizontal = 10.dp)) }
    }
}

/** The peach "Some required permissions are missing" banner. */
@Composable
fun PermissionBanner(onFix: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(LevoyColors.Peach).border(1.dp, LevoyColors.PeachBorder, RoundedCornerShape(10.dp)).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(Color(0xFFFFD08A)), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.Info, null, tint = Color(0xFFE08A00), modifier = Modifier.size(26.dp))
        }
        Spacer(Modifier.width(14.dp))
        Text(
            androidx.compose.ui.text.buildAnnotatedString {
                append("Some required permissions are missing. Please fix this for smooth functionality. ")
                pushStyle(androidx.compose.ui.text.SpanStyle(color = LevoyColors.Link, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline))
                append("FIX NOW")
                pop()
            },
            style = Txt.Body.copy(fontSize = 16.sp), color = LevoyColors.OnPeach, modifier = Modifier.clickable(onClick = onFix),
        )
    }
}

@Composable
fun SearchField(value: String, onChange: (String) -> Unit, hint: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(10.dp)).background(Pal.card).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Search, null, tint = Pal.textSecondary, modifier = Modifier.size(28.dp))
        Spacer(Modifier.width(14.dp))
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) Text(hint, style = Txt.Body.copy(fontSize = 19.sp), color = Pal.textSecondary)
            BasicTextField(value, onChange, singleLine = true, textStyle = Txt.Body.copy(fontSize = 19.sp, color = Pal.text), cursorBrush = SolidColor(LevoyColors.Amber), modifier = Modifier.fillMaxWidth())
        }
    }
}

/** The "Today ⌄" dropdown pill in the date strip. */
@Composable
fun RangeStrip(label: String, presetLabel: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().background(Pal.strip).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = Txt.Section.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, fontSize = 20.sp), color = Color.White, modifier = Modifier.weight(1f).padding(end = 12.dp))
        Row(
            Modifier.width(112.dp).height(72.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFF2B2C31)).clickable(onClick = onClick).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(presetLabel, style = Txt.Section.copy(fontSize = 16.sp), color = Color.White, modifier = Modifier.weight(1f), maxLines = 1)
            Icon(Icons.Filled.KeyboardArrowDown, null, tint = Color.White, modifier = Modifier.size(26.dp))
        }
    }
}

/* ───────────────────────────── tabs ───────────────────────────── */

data class TabDef(val key: String, val label: String, val icon: (@Composable (Color) -> Unit)? = null, val tint: Color = Color.Unspecified)

/** Horizontally scrolling tabs: optional coloured icon above, bold when selected, a dot underneath. */
@Composable
fun ScrollTabs(tabs: List<TabDef>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier, scroll: Boolean = true) {
    val rowMod = if (scroll) modifier.fillMaxWidth().horizontalScroll(rememberScrollState()) else modifier.fillMaxWidth()
    Row(rowMod, horizontalArrangement = if (scroll) Arrangement.Start else Arrangement.SpaceEvenly) {
        tabs.forEach { t ->
            val on = t.key == selected
            Column(
                Modifier.then(if (scroll) Modifier.padding(horizontal = 14.dp) else Modifier.weight(1f)).clickable { onSelect(t.key) }.padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                t.icon?.invoke(t.tint)
                Text(t.label, style = if (on) Txt.TabActive else Txt.Tab, color = if (on) Pal.text else Pal.textSecondary, maxLines = 1)
                Spacer(Modifier.height(6.dp))
                Box(Modifier.size(6.dp).clip(CircleShape).background(if (on) Pal.text else Color.Transparent))
            }
        }
    }
}

/* ───────────────────────────── call row bits ───────────────────────────── */

/** The round coloured icon at the left of a call card. */
@Composable
fun KindCircle(kind: com.levoy.app.data.CallKind, size: Dp = 52.dp) {
    val (bg, icon) = when (kind) {
        com.levoy.app.data.CallKind.incoming -> LevoyColors.IncomingIcon to Icons.Filled.PhoneCallback
        com.levoy.app.data.CallKind.outgoing -> LevoyColors.OutgoingIcon to Icons.Filled.PhoneForwarded
        com.levoy.app.data.CallKind.missed -> LevoyColors.MissedIcon to Icons.Filled.PhoneMissed
        com.levoy.app.data.CallKind.rejected -> LevoyColors.MissedIcon to Icons.Filled.PhoneDisabled
    }
    Box(Modifier.size(size).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = Color(0xFF222328), modifier = Modifier.size(size * 0.52f))
    }
}

/** copy · message · whatsapp · call — the four glyphs under every number. */
@Composable
fun ActionIcons(phone: String, onCopy: () -> Unit, onSms: () -> Unit, onWhatsApp: () -> Unit, onCall: () -> Unit, modifier: Modifier = Modifier, iconSize: Dp = 34.dp) {
    Row(modifier, horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.ContentCopy, "Copy", tint = Pal.textSecondary, modifier = Modifier.size(iconSize).clickable(onClick = onCopy).padding(4.dp))
        Icon(Icons.Filled.Message, "Message", tint = LevoyColors.Sms, modifier = Modifier.size(iconSize).clickable(onClick = onSms).padding(4.dp))
        WhatsAppGlyph(Modifier.size(iconSize).clickable(onClick = onWhatsApp))
        Icon(Icons.Filled.Call, "Call", tint = LevoyColors.Link, modifier = Modifier.size(iconSize).clickable(onClick = onCall).padding(4.dp))
    }
}

@Composable
fun WhatsAppGlyph(modifier: Modifier = Modifier, tint: Color = LevoyColors.WhatsApp) {
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize().padding(2.dp)) {
            drawCircle(tint, radius = size.minDimension / 2 - 2f, style = Stroke(width = 3.5f))
            drawLine(tint, Offset(size.width * 0.12f, size.height * 0.95f), Offset(size.width * 0.2f, size.height * 0.72f), strokeWidth = 5f, cap = StrokeCap.Round)
        }
        Icon(Icons.Filled.Call, null, tint = tint, modifier = Modifier.fillMaxSize(0.5f))
    }
}

/** Text with a leading round icon, used for the stat tiles and settings rows. */
@Composable
fun BigText(text: String, style: TextStyle, modifier: Modifier = Modifier, color: Color = Pal.text, align: TextAlign = TextAlign.Start) {
    Text(text, style = style, color = color, modifier = modifier, textAlign = align)
}

@Composable
fun FullScreen(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().background(Pal.background)) { content() }
}
