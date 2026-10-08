package com.levoy.app.data

/** A phone number reduced to its last 10 digits, so "+91 98408 48003", "098408 48003" and "9840848003" are the same number. */
fun phoneKeyOf(number: String?): String? = number?.filter { it.isDigit() }?.takeLast(10)?.takeIf { it.length >= 7 }
