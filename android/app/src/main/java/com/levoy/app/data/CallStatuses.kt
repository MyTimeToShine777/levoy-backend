package com.levoy.app.data

/** One Call Status a telecaller can record, and the pipeline stage it moves the lead to. */
data class CallStatusOption(val name: String, val stage: String?)

/** The status stored for a lead nobody has called yet (shown as "(Not called yet)", sent as null). */
const val NOT_CALLED_KEY = "notcalledyet"

/**
 * Used when this person may not read Lead Rules. Same vocabulary and stage mapping the server's importer uses.
 */
val DEFAULT_CALL_STATUSES = listOf(
    CallStatusOption("Not Answered", "contacted"),
    CallStatusOption("Under Consideration", "qualified"),
    CallStatusOption("Interested", "qualified"),
    CallStatusOption("Not Interested", "lost"),
    CallStatusOption("Call Back Later", "contacted"),
    CallStatusOption("Demo Done", "proposal"),
    CallStatusOption("Converted", "won"),
    CallStatusOption("Switched Off / Invalid Number", "lost"),
)

/** Letters and digits of the name, lower-cased: "Not answered" and "Not Answered" are the same status. */
fun statusKeyOf(s: String) = s.lowercase().replace(Regex("[^a-z0-9]+"), "")
