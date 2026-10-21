package com.levoy.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.levoy.app.data.Bucket
import com.levoy.app.ui.theme.CallioColors
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

data class Slice(val label: String, val value: Int, val color: Color)

val IncomingColor = CallioColors.Incoming
val OutgoingColor = CallioColors.Outgoing
val MissedColor = CallioColors.Missed
val RejectedColor = CallioColors.Rejected

/** Legend row: coloured dot + label, spaced like "● Incoming  ● Outgoing  ● Missed". */
@Composable
fun Legend(items: List<Pair<String, Color>>, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        items.forEachIndexed { i, (label, c) ->
            if (i > 0) Spacer(Modifier.width(10.dp))
            Box(Modifier.size(13.dp).clip(CircleShape).background(c))
            Spacer(Modifier.width(5.dp))
            Text(label, style = Txt.Small.copy(fontSize = 13.sp), color = Pal.text, maxLines = 1, softWrap = false)
        }
    }
}

/** A thick donut with a thin pale inner ring and the percentage written on each slice. */
@Composable
fun Donut(slices: List<Slice>, modifier: Modifier = Modifier) {
    val total = slices.sumOf { it.value }.coerceAtLeast(1)
    val measurer = rememberTextMeasurer()
    val labelStyle = TextStyle(color = Color.White, fontSize = 17.sp)
    Canvas(modifier.aspectRatio(1f)) {
        val stroke = size.minDimension * 0.25f
        val d = size.minDimension - stroke
        val tl = Offset((size.width - d) / 2, (size.height - d) / 2)
        var start = -90f
        val centers = ArrayList<Triple<Float, Float, String>>()
        slices.filter { it.value > 0 }.forEach { s ->
            val sweep = 360f * s.value / total
            drawArc(s.color, start, sweep, false, tl, Size(d, d), style = Stroke(stroke))
            val mid = (start + sweep / 2) * (PI / 180.0)
            val r = d / 2
            centers.add(Triple((size.width / 2 + r * cos(mid)).toFloat(), (size.height / 2 + r * sin(mid)).toFloat(), "${Math.round(100f * s.value / total)}%"))
            start += sweep
        }
        // pale inner ring
        val inner = d - stroke * 1.0f
        drawArc(Color.White.copy(alpha = 0.45f), 0f, 360f, false, Offset((size.width - inner) / 2, (size.height - inner) / 2), Size(inner, inner), style = Stroke(size.minDimension * 0.022f))
        centers.forEach { (x, y, t) ->
            val m = measurer.measure(t, labelStyle)
            drawText(m, topLeft = Offset(x - m.size.width / 2, y - m.size.height / 2))
        }
    }
}

/**
 * Grouped bars (one cluster per bucket, one bar per call kind) with grid lines and a tooltip-free axis.
 * `mode` picks calls or talk time; talk time shows only incoming and outgoing.
 */
@Composable
fun GroupedBars(raw: List<Bucket>, unit: String, durationMode: Boolean, modifier: Modifier = Modifier, height: Int = 260) {
    val buckets = if (unit == "hour") coarse(raw, 3) else raw
    val measurer = rememberTextMeasurer()
    val axis = TextStyle(color = Pal.text, fontSize = 13.sp)
    val kinds: List<Pair<(Bucket) -> Int, Color>> = if (durationMode)
        listOf<Pair<(Bucket) -> Int, Color>>({ b: Bucket -> b.incoming_duration } to IncomingColor, { b: Bucket -> b.outgoing_duration } to OutgoingColor)
    else listOf<Pair<(Bucket) -> Int, Color>>(
        { b: Bucket -> b.incoming } to IncomingColor, { b: Bucket -> b.outgoing } to OutgoingColor, { b: Bucket -> b.missed } to MissedColor, { b: Bucket -> b.rejected } to RejectedColor,
    )
    val grid = Pal.chartGrid
    Canvas(modifier.fillMaxWidth().height(height.dp)) {
        val left = 40.dp.toPx(); val bottom = 28.dp.toPx(); val top = 8.dp.toPx()
        val w = size.width - left - 6.dp.toPx(); val h = size.height - bottom - top
        val maxV = max(1, buckets.maxOfOrNull { b -> kinds.maxOf { it.first(b) } } ?: 1)
        // round the scale up to an even tick count
        val steps = 5
        val stepV = Math.ceil(maxV / steps.toDouble()).toInt().coerceAtLeast(1)
        val top0 = stepV * steps
        for (i in 0..steps) {
            val y = top + h - h * i / steps
            drawLine(grid, Offset(left, y), Offset(left + w, y), strokeWidth = 1.2f)
            val label = if (durationMode) "${(stepV * i) / 60}m" else "${stepV * i}"
            val m = measurer.measure(label, axis)
            drawText(m, topLeft = Offset(left - 10.dp.toPx() - m.size.width, y - m.size.height / 2))
        }
        val n = max(buckets.size, 1)
        val slot = w / n
        val barW = (slot * 0.8f / kinds.size).coerceAtMost(30.dp.toPx())
        val every = if (unit == "hour") 2 else Math.ceil(n / 5.0).toInt().coerceAtLeast(1)
        buckets.forEachIndexed { i, b ->
            val groupW = barW * kinds.size
            val x0 = left + slot * i + (slot - groupW) / 2
            kinds.forEachIndexed { k, (get, color) ->
                val v = get(b)
                if (v > 0) {
                    val bh = h * v / top0
                    drawRect(color, Offset(x0 + barW * k, top + h - bh), Size(barW, bh))
                }
            }
            if (i % every == 0) {
                val m = measurer.measure(axisLabel(b.bucket, unit), axis)
                drawText(m, topLeft = Offset(left + slot * i + slot / 2 - m.size.width / 2, size.height - bottom + 6.dp.toPx()))
            }
        }
    }
}

/** Merge consecutive buckets (hours into 3-hour blocks) so the bars are wide enough to read. */
private fun coarse(b: List<Bucket>, k: Int): List<Bucket> = b.chunked(k).map { ch -> Bucket(ch.first().bucket, ch.sumOf { it.incoming }, ch.sumOf { it.outgoing }, ch.sumOf { it.missed }, ch.sumOf { it.rejected }, ch.sumOf { it.incoming_duration }, ch.sumOf { it.outgoing_duration }) }

private fun axisLabel(bucket: String, unit: String): String = runCatching {
    when (unit) {
        "hour" -> { val h = bucket.substring(11, 13).toInt(); val hr = if (h % 12 == 0) 12 else h % 12; "${hr.toString().padStart(2, '0')}:00 ${if (h < 12) "AM" else "PM"}" }
        "month" -> LocalDate.parse("$bucket-01").format(DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH))
        else -> LocalDate.parse(bucket).format(DateTimeFormatter.ofPattern("dd MMM", Locale.ENGLISH))
    }
}.getOrDefault(bucket)

@Composable
fun ChartCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth().clip(androidx.compose.foundation.shape.RoundedCornerShape(24.dp)).background(Pal.card).padding(horizontal = 16.dp, vertical = 22.dp)) { content() }
}
