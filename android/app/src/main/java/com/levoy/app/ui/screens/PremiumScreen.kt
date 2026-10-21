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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.levoy.app.data.PlanState
import com.levoy.app.ui.PrimaryButton
import com.levoy.app.ui.FullScreen
import com.levoy.app.ui.theme.CallioColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt
import com.levoy.app.util.T

data class PremiumUi(val plan: PlanState? = null, val tab: String = "premium", val busy: Boolean = false, val message: String? = null, val loading: Boolean = false)

class PremiumActions(val onTab: (String) -> Unit = {}, val onSubscribe: (String) -> Unit = {}, val onRetry: () -> Unit = {})

private data class PlanTab(val key: String, val label: String, val icon: ImageVector)

private val TAB_ICONS = listOf(Icons.Filled.Star, Icons.Filled.WorkspacePremium, Icons.Filled.EmojiEvents)

/** ₹75, ₹99.5 — prices are set by the platform owner and may have decimals. */
private fun priceText(e: com.levoy.app.data.PlanEntry): String {
    val p = e.price_monthly ?: return "Custom"
    val n = if (p % 1.0 == 0.0) p.toLong().toString() else p.toString()
    return (if (e.currency == "INR") "₹" else e.currency + " ") + n
}

@Composable
fun PremiumScreen(ui: PremiumUi, a: PremiumActions) {
    FullScreen {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 120.dp)) {
            Spacer(Modifier.height(14.dp))
            Text(T("upgrade_title"), style = Txt.Title.copy(fontSize = 26.sp), color = Pal.text)
            Spacer(Modifier.height(30.dp))
            val p = ui.plan
            // every paid plan on sale, in the order the platform owner set; the Free plan is not a tab
            val tabs = p?.catalog.orEmpty().filter { it.key != "free" }.mapIndexed { i, e -> PlanTab(e.key, e.name, TAB_ICONS[i % TAB_ICONS.size]) }
            val tabKey = tabs.firstOrNull { it.key == ui.tab }?.key ?: tabs.firstOrNull()?.key
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                tabs.forEach { t ->
                    val on = t.key == tabKey
                    Column(Modifier.weight(1f).clickable { a.onTab(t.key) }, horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(t.icon, null, tint = if (on) Pal.primary else Pal.textSecondary, modifier = Modifier.size(40.dp))
                        Spacer(Modifier.height(6.dp))
                        Text(t.label, style = if (on) Txt.TabActive.copy(fontSize = 17.sp) else Txt.Tab.copy(fontSize = 17.sp), color = if (on) Pal.text else Pal.textSecondary)
                        Spacer(Modifier.height(6.dp))
                        Box(Modifier.size(6.dp).clip(androidx.compose.foundation.shape.CircleShape).background(if (on) Pal.text else Color.Transparent))
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            // no early `return@Column`: leaving a composable lambda half way crashes this Compose version while the plan is loading
            if (p == null) {
                Text(if (ui.loading) "Loading…" else "Could not load the plans", style = Txt.Body, color = Pal.textSecondary, modifier = Modifier.clickable(onClick = a.onRetry).padding(16.dp))
            } else PremiumBody(p, tabKey, ui, a)
        }
    }
}

@Composable
private fun PremiumBody(p: PlanState, tabKey: String?, ui: PremiumUi, a: PremiumActions) {
    val entry = p.catalog.firstOrNull { it.key == tabKey }
    Text(T("unlock"), style = Txt.Body.copy(fontSize = 20.sp), color = Pal.text)
    Spacer(Modifier.height(14.dp))
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // each plan lists everything it includes: show what it ADDS over the plan before it
        val prev = p.catalog.getOrNull(p.catalog.indexOfFirst { it.key == tabKey } - 1)
        if (prev != null && prev.key != "free") Bullet("Everything in ${prev.name} Plan.")
        entry?.features?.filter { f -> prev == null || prev.features.none { it.key == f.key } }?.forEach { Bullet(it.label) }
    }
    Spacer(Modifier.height(36.dp))
    Text(T("choose_plan"), style = Txt.Body.copy(fontSize = 20.sp), color = Pal.text)
    Spacer(Modifier.height(30.dp))
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).border(2.dp, Pal.divider, RoundedCornerShape(26.dp))) {
        Row(Modifier.fillMaxWidth().background(Pal.card).padding(horizontal = 22.dp, vertical = 26.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)).background(Pal.background))
            Spacer(Modifier.width(22.dp))
            Text(T("one_month"), style = Txt.Body.copy(fontSize = 30.sp), color = Pal.text)
        }
        Text(
            if (entry != null) priceText(entry) else "Custom",
            style = Txt.Section.copy(fontSize = 36.sp, fontWeight = FontWeight.Bold), color = Color(0xFF8A94A8), modifier = Modifier.padding(horizontal = 22.dp, vertical = 28.dp),
        )
    }
    Spacer(Modifier.height(34.dp))
    val current = p.effective_plan == tabKey
    PrimaryButton(
        when { current -> T("current_plan"); ui.busy -> "Please wait…"; else -> T("subscribe") },
        { if (!current && !ui.busy) tabKey?.let(a.onSubscribe) },
        Modifier.fillMaxWidth().padding(horizontal = 24.dp), height = 66.dp, corner = 33.dp, enabled = !current,
    )
    Spacer(Modifier.height(18.dp))
    Text(
        if (p.trial_available) T("trial_note") else if (p.status == "trial" && current) "Trial ends ${p.trial_ends_at?.take(10) ?: ""}" else if (current && p.cancel_at_period_end) "Cancelled — stays on until ${p.current_period_end?.take(10) ?: ""}" else T("trial_note"),
        style = Txt.Body.copy(fontSize = 17.sp), color = Pal.textSecondary, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
    )
    if (ui.message != null) {
        Spacer(Modifier.height(14.dp))
        Text(ui.message, style = Txt.Body.copy(fontSize = 16.sp), color = Pal.primary, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
    }
    Spacer(Modifier.height(34.dp))
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).border(1.dp, Pal.divider, RoundedCornerShape(16.dp)).padding(16.dp), verticalAlignment = Alignment.Top) {
        Icon(Icons.Filled.Info, null, tint = Pal.text, modifier = Modifier.size(28.dp))
        Spacer(Modifier.width(12.dp))
        Text(if (p.payments_connected) "You pay securely on Stripe’s page in your browser, then come back here. Only a workspace admin can buy a plan; the free trial can be used once." else "Online payment is not available yet. Plans are switched on by the Callio team — contact support. The free trial can be used once.", style = Txt.Body.copy(fontSize = 16.sp), color = Pal.text)
    }
}

@Composable
private fun Bullet(text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Icon(Icons.Filled.Verified, null, tint = Color(0xFFF0A800), modifier = Modifier.size(30.dp).padding(top = 2.dp))
        Spacer(Modifier.width(16.dp))
        Text(text, style = Txt.Body.copy(fontSize = 20.sp, lineHeight = 28.sp), color = Pal.text)
    }
}
