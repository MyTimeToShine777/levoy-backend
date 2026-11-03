package com.levoy.app.data

/**
 * API shapes. Every field has a default so Kotlin generates a no-arg constructor and Gson fills in
 * whatever the server sends — a missing field never becomes a null in a non-null property.
 */

data class User(
    val id: Int = 0,
    val email: String = "",
    val name: String = "",
    val phone: String? = null,
    val role: String = "agent",
)

data class AuthResponse(val access_token: String = "", val user: User = User(), val platform: Boolean = false, val refresh_token: String? = null)

/** The answer to a refresh: a new pair of keys. */
data class Refreshed(val access_token: String = "", val refresh_token: String = "")
/** Reply to asking for a sign-in code: how many seconds until another may be requested. */
data class OtpSent(val message: String = "", val resend_in: Int = 60)

data class Tag(val id: Int = 0, val name: String = "", val color: String? = null)
data class GroupRef(val id: Int = 0, val name: String = "", val color: String? = null)
data class LeadRef(val id: Int = 0, val name: String = "")

enum class CallKind { incoming, outgoing, missed, rejected }

data class CallRow(
    val id: Int = 0,
    val phone_number: String = "",
    val phone_key: String = "",
    val contact_name: String? = null,
    val kind: String = "outgoing",
    val duration_seconds: Int = 0,
    val timestamp: String = "",
    val sim_slot: Int? = null,
    val sim_label: String? = null,
    val source: String = "sim",
    val notes: String? = null,
    val tags: List<Tag> = emptyList(),
    val lead: LeadRef? = null,
) {
    val callKind: CallKind get() = runCatching { CallKind.valueOf(kind) }.getOrDefault(CallKind.outgoing)
    // the phone's saved contact name wins; otherwise the lead this number belongs to, so a lead is never shown as "Unknown"
    val displayName: String get() = contact_name?.takeIf { it.isNotBlank() } ?: lead?.name?.takeIf { it.isNotBlank() } ?: "Unknown"
}

data class SimSeen(val source: String = "sim", val slot: Int? = null, val label: String? = null, val calls: Int = 0)

data class Attempt(val id: Int = 0, val timestamp: String = "")
data class AttemptGroup(
    val phone_number: String = "",
    val phone_key: String = "",
    val contact_name: String? = null,
    val count: Int = 0,
    val attempts: List<Attempt> = emptyList(),
)

data class HistoryResponse(
    val tab: String = "all",
    val counts: Map<String, Int> = emptyMap(),
    val total: Int = 0,
    val rows: List<CallRow> = emptyList(),
    val sims: List<SimSeen> = emptyList(),
    val groups: List<AttemptGroup>? = null,
)

data class Bucket(
    val bucket: String = "",
    val incoming: Int = 0, val outgoing: Int = 0, val missed: Int = 0, val rejected: Int = 0,
    val incoming_duration: Int = 0, val outgoing_duration: Int = 0,
)

data class Series(val unit: String = "day", val buckets: List<Bucket> = emptyList())
data class CallsAndDuration(val calls: Int = 0, val duration: Int = 0)
data class WorkingTotals(val days: Int = 0, val calls: Int = 0, val talk_seconds: Int = 0, val working_seconds: Int = 0, val idle_seconds: Int = 0)
data class WorkingHours(val totals: WorkingTotals = WorkingTotals(), val needs_user: Boolean = false)

data class SummaryRange(val from: String? = null, val to: String? = null)

data class Summary(
    val range: SummaryRange = SummaryRange(),
    val totals: CallsAndDuration = CallsAndDuration(),
    val incoming: CallsAndDuration = CallsAndDuration(),
    val outgoing: CallsAndDuration = CallsAndDuration(),
    val missed: CallsAndDuration = CallsAndDuration(),
    val rejected: CallsAndDuration = CallsAndDuration(),
    val never_attended: CallsAndDuration = CallsAndDuration(),
    val not_pickup: CallsAndDuration = CallsAndDuration(),
    val unique_calls: Int? = null,
    val connected_calls: Int? = null,
    val working: WorkingHours? = null,
    val locked: List<String> = emptyList(),
    val series: Series = Series(),
)

data class LongestCall(val duration_seconds: Int = 0, val timestamp: String = "", val kind: String = "outgoing")
data class FrequentDay(val day: String = "", val calls: Int = 0, val incoming: Int = 0, val outgoing: Int = 0)

data class ContactRow(
    val phone_key: String = "",
    val phone_number: String = "",
    val contact_name: String? = null,
    val total_calls: Int = 0,
    val total_duration: Int = 0,
    val groups: List<GroupRef> = emptyList(),
)

data class ContactsResponse(val total: Int = 0, val rows: List<ContactRow> = emptyList())

data class ContactHeader(val phone_key: String = "", val phone_number: String = "", val contact_name: String? = null, val groups: List<GroupRef> = emptyList())
data class RangeInfo(val from: String = "", val to: String = "", val total_days: Int = 0)
data class ContactAnalysis(val series: Series = Series(), val longest_call: LongestCall? = null, val frequently_talked: FrequentDay? = null)
data class HistoryItem(
    val id: Int = 0, val kind: String = "outgoing", val duration_seconds: Int = 0, val timestamp: String = "",
    val notes: String? = null, val sim_slot: Int? = null,
) { val callKind: CallKind get() = runCatching { CallKind.valueOf(kind) }.getOrDefault(CallKind.outgoing) }

data class ContactDetail(
    val contact: ContactHeader = ContactHeader(),
    val range: RangeInfo = RangeInfo(),
    val summary: Map<String, CallsAndDuration> = emptyMap(),
    val analysis: ContactAnalysis = ContactAnalysis(),
    val history: List<HistoryItem> = emptyList(),
)

data class CompareRow(
    val phone_key: String = "", val contact_name: String? = null, val phone_number: String = "",
    val calls: Int = 0, val duration: Int = 0,
    val incoming: Int = 0, val incoming_duration: Int = 0, val outgoing: Int = 0, val outgoing_duration: Int = 0,
    val missed: Int = 0, val rejected: Int = 0,
)

data class PlanFeature(val key: String = "", val label: String = "", val added_by: String? = null)
data class PlanEntry(
    val key: String = "", val name: String = "", val price_monthly: Double? = null, val currency: String = "INR",
    val tagline: String = "", val features: List<PlanFeature> = emptyList(),
)

data class Checkout(val url: String = "", val session_id: String = "")

data class PlanState(
    val plan: String = "free", val plan_name: String? = null, val status: String = "active", val effective_plan: String = "free",
    val cancel_at_period_end: Boolean = false,
    val trial_ends_at: String? = null, val current_period_end: String? = null,
    val trial_available: Boolean = false, val trial_days: Int = 7, val payments_connected: Boolean = false,
    val enabled: List<String> = emptyList(), val catalog: List<PlanEntry> = emptyList(),
) { fun has(feature: String) = feature in enabled }

data class Sim(
    val slot: Int = 0, val label: String? = null, val number: String? = null,
    val verified: Boolean = false, val verify_method: String? = null,
)

data class Reminder(val id: Int = 0, val phone_number: String = "", val note: String = "", val done: Boolean = false, val remind_at: String? = null, val contact_name: String? = null)

data class ExportResult(val export_id: Int = 0, val filename: String = "", val rows: Int = 0)
data class Consent(val accepted: Boolean = false)
data class Ok(val ok: Boolean = false)

data class HourCalls(val hour: Int = 0, val calls: Int = 0)
data class FrequentContact(val phone_key: String = "", val phone_number: String = "", val contact_name: String? = null, val calls: Int = 0, val duration: Int = 0)
data class LongestCallFull(val duration_seconds: Int = 0, val timestamp: String = "", val kind: String = "outgoing", val phone_number: String = "", val contact_name: String? = null)
data class Analysis(
    val by_hour: List<HourCalls> = emptyList(),
    val longest_call: LongestCallFull? = null,
    val most_frequent: List<FrequentContact> = emptyList(),
    val avg_connected_duration: Int = 0,
    val outgoing_connect_rate: Double = 0.0,
)

data class QuickCommand(val id: Int = 0, val phone_number: String = "", val name: String? = null)
data class QuickPending(val commands: List<QuickCommand> = emptyList())
data class QuickDevice(val id: Int = 0, val device_name: String = "", val online: Boolean = false)
data class BackfillResult(val received: Int = 0, val updated: Int = 0)

/** What the workspace admin configured for the phone app's More / Help screens. Blank = hidden. */
data class WorkspaceSettings(
    val support_whatsapp: String = "", val blog_url: String = "",
    val social_twitter: String = "", val social_instagram: String = "", val social_facebook: String = "",
    val social_telegram: String = "", val social_reddit: String = "",
)

/** A lead as the list / detail endpoints return it. `call_status` null means "Not called yet". */
data class LeadRow(
    val id: Int = 0, val name: String = "", val phone: String = "", val email: String? = null,
    val status: String = "new", val priority: String = "normal", val notes: String? = null,
    val call_status: String? = null, val tier: String? = null, val priority_score: Int? = null,
    val assigned_to_name: String? = null, val next_best_action: String? = null,
)

/** One Call Status the workspace scores (Lead Rules). `pipeline_stage` is the stage a lead moves to when it is chosen. */
data class CallStatusRule(val call_status: String = "", val status_key: String = "", val pipeline_stage: String? = null)
data class StatusRules(val status_rules: List<CallStatusRule> = emptyList())
