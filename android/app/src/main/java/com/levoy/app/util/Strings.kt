package com.levoy.app.util

/**
 * Translations for the navigation, tabs, summary labels and settings rows — the same six languages
 * the reference app offers. Anything not listed (long help texts, error messages) stays English;
 * a missing translation always falls back to English rather than showing a key.
 */
enum class Lang(val code: String, val native: String) {
    En("en", "English"),
    Ru("ru", "русский (Russian)"),
    Es("es", "Español (Spanish)"),
    De("de", "Deutsche (German)"),
    Fr("fr", "Française (French)"),
    Tr("tr", "Türk (Turkish)");

    companion object { fun of(code: String) = entries.firstOrNull { it.code == code } ?: En }
}

object Strings {
    @Volatile var lang: Lang = Lang.En

    // order: en, ru, es, de, fr, tr
    private fun r(en: String, ru: String, es: String, de: String, fr: String, tr: String) = listOf(en, ru, es, de, fr, tr)

    private val table: Map<String, List<String>> = mapOf(
        "nav_history" to r("Call History", "История звонков", "Historial", "Anrufliste", "Historique", "Arama Geçmişi"),
        "nav_analytics" to r("Analytics", "Аналитика", "Analíticas", "Analyse", "Analyses", "Analizler"),
        "nav_premium" to r("Premium", "Премиум", "Premium", "Premium", "Premium", "Premium"),
        "nav_contacts" to r("Contacts", "Контакты", "Contactos", "Kontakte", "Contacts", "Kişiler"),
        "nav_more" to r("More", "Ещё", "Más", "Mehr", "Plus", "Daha fazla"),
        "tab_all" to r("All Calls", "Все звонки", "Todas", "Alle Anrufe", "Tous", "Tüm Aramalar"),
        "tab_incoming" to r("Incoming", "Входящие", "Entrantes", "Eingehend", "Entrants", "Gelen"),
        "tab_outgoing" to r("Outgoing", "Исходящие", "Salientes", "Ausgehend", "Sortants", "Giden"),
        "tab_missed" to r("Missed", "Пропущенные", "Perdidas", "Verpasst", "Manqués", "Cevapsız"),
        "tab_rejected" to r("Rejected", "Отклонённые", "Rechazadas", "Abgelehnt", "Rejetés", "Reddedilen"),
        "tab_never" to r("Never Attended Calls", "Без ответа", "Nunca atendidas", "Nie beantwortet", "Jamais répondus", "Hiç Cevaplanmayan"),
        "tab_notpickup" to r("Not Pickup by Client", "Клиент не ответил", "Cliente no contestó", "Kunde nahm nicht ab", "Client sans réponse", "Müşteri Açmadı"),
        "search" to r("Search", "Поиск", "Buscar", "Suchen", "Rechercher", "Ara"),
        "search_contacts" to r("Search contacts", "Поиск контактов", "Buscar contactos", "Kontakte suchen", "Rechercher des contacts", "Kişilerde ara"),
        "today" to r("Today", "Сегодня", "Hoy", "Heute", "Aujourd'hui", "Bugün"),
        "yesterday" to r("Yesterday", "Вчера", "Ayer", "Gestern", "Hier", "Dün"),
        "week" to r("Week", "Неделя", "Semana", "Woche", "Semaine", "Hafta"),
        "month" to r("Month", "Месяц", "Mes", "Monat", "Mois", "Ay"),
        "year" to r("Year", "Год", "Año", "Jahr", "Année", "Yıl"),
        "custom" to r("Custom", "Свой период", "Personalizado", "Benutzerdefiniert", "Personnalisé", "Özel"),
        "all_time" to r("All Time", "За всё время", "Todo el tiempo", "Gesamte Zeit", "Tout", "Tüm Zamanlar"),
        "reset" to r("Reset", "Сбросить", "Restablecer", "Zurücksetzen", "Réinitialiser", "Sıfırla"),
        "done" to r("Done", "Готово", "Hecho", "Fertig", "Terminé", "Bitti"),
        "cancel" to r("Cancel", "Отмена", "Cancelar", "Abbrechen", "Annuler", "İptal"),
        "save" to r("Save", "Сохранить", "Guardar", "Speichern", "Enregistrer", "Kaydet"),
        "add_to_group" to r("Add to Group", "В группу", "Añadir al grupo", "Zur Gruppe", "Ajouter au groupe", "Gruba Ekle"),
        "total_calls" to r("Total Calls", "Всего звонков", "Llamadas totales", "Anrufe gesamt", "Total des appels", "Toplam Arama"),
        "summary" to r("Summary", "Сводка", "Resumen", "Übersicht", "Résumé", "Özet"),
        "analysis" to r("Analysis", "Анализ", "Análisis", "Auswertung", "Analyse", "Analiz"),
        "call_history_tab" to r("Call History", "История", "Historial", "Verlauf", "Historique", "Geçmiş"),
        "calls" to r("Calls", "Звонки", "Llamadas", "Anrufe", "Appels", "Aramalar"),
        "duration" to r("Duration", "Длительность", "Duración", "Dauer", "Durée", "Süre"),
        "total" to r("TOTAL", "ИТОГО", "TOTAL", "GESAMT", "TOTAL", "TOPLAM"),
        "total_phone_calls" to r("Total Phone Calls", "Всего звонков", "Llamadas totales", "Anrufe gesamt", "Total des appels", "Toplam Arama"),
        "incoming_calls" to r("Incoming Calls", "Входящие", "Llamadas entrantes", "Eingehende Anrufe", "Appels entrants", "Gelen Aramalar"),
        "outgoing_calls" to r("Outgoing Calls", "Исходящие", "Llamadas salientes", "Ausgehende Anrufe", "Appels sortants", "Giden Aramalar"),
        "missed_calls" to r("Missed Calls", "Пропущенные", "Llamadas perdidas", "Verpasste Anrufe", "Appels manqués", "Cevapsız Aramalar"),
        "rejected_calls" to r("Rejected Calls", "Отклонённые", "Llamadas rechazadas", "Abgelehnte Anrufe", "Appels rejetés", "Reddedilen Aramalar"),
        "never_calls" to r("Never Attended Calls", "Без ответа", "Nunca atendidas", "Nie beantwortet", "Jamais répondus", "Hiç Cevaplanmayan"),
        "notpickup_calls" to r("Not Pickup by Client", "Клиент не ответил", "Cliente no contestó", "Kunde nahm nicht ab", "Client sans réponse", "Müşteri Açmadı"),
        "unique_calls" to r("Unique Calls", "Уникальные", "Llamadas únicas", "Eindeutige Anrufe", "Appels uniques", "Benzersiz Aramalar"),
        "connected_calls" to r("Connected Calls", "Соединённые", "Llamadas conectadas", "Verbundene Anrufe", "Appels connectés", "Bağlanan Aramalar"),
        "working_hours" to r("Working Hours", "Рабочие часы", "Horas de trabajo", "Arbeitszeit", "Heures de travail", "Çalışma Saatleri"),
        "ideal_time" to r("Ideal Time", "Время простоя", "Tiempo inactivo", "Leerlaufzeit", "Temps d'inactivité", "Boş Zaman"),
        "tap_note" to r("Tap to add note & tag", "Добавить заметку и тег", "Toca para añadir nota y etiqueta", "Notiz & Tag hinzufügen", "Ajouter une note et un tag", "Not ve etiket ekle"),
        "more_settings" to r("Settings", "Настройки", "Ajustes", "Einstellungen", "Paramètres", "Ayarlar"),
        "sim_number" to r("SIM Number", "Номер SIM", "Número SIM", "SIM-Nummer", "Numéro SIM", "SIM Numarası"),
        "whatsapp_call" to r("WhatsApp Call", "Звонки WhatsApp", "Llamada de WhatsApp", "WhatsApp-Anruf", "Appel WhatsApp", "WhatsApp Araması"),
        "call_recording" to r("Call Recording", "Запись звонков", "Grabación de llamadas", "Anrufaufzeichnung", "Enregistrement des appels", "Arama Kaydı"),
        "quick_action" to r("Quick Action", "Быстрое действие", "Acción rápida", "Schnellaktion", "Action rapide", "Hızlı Eylem"),
        "language" to r("Language", "Язык", "Idioma", "Sprache", "Langue", "Dil"),
        "theme" to r("Theme", "Тема", "Tema", "Design", "Thème", "Tema"),
        "time_format" to r("Time Format", "Формат времени", "Formato de hora", "Zeitformat", "Format de l'heure", "Saat Biçimi"),
        "default_screen" to r("Set Default Screen", "Экран по умолчанию", "Pantalla predeterminada", "Standardbildschirm", "Écran par défaut", "Varsayılan Ekran"),
        "troubleshooting" to r("Troubleshooting", "Устранение проблем", "Solución de problemas", "Fehlerbehebung", "Dépannage", "Sorun Giderme"),
        "compare" to r("Compare", "Сравнить", "Comparar", "Vergleichen", "Comparer", "Karşılaştır"),
        "help_support" to r("Help & Support", "Помощь и поддержка", "Ayuda y soporte", "Hilfe & Support", "Aide & assistance", "Yardım ve Destek"),
        "invite" to r("Invite Friends", "Пригласить друзей", "Invitar amigos", "Freunde einladen", "Inviter des amis", "Arkadaşlarını Davet Et"),
        "rate" to r("Rate App", "Оценить приложение", "Valorar la app", "App bewerten", "Noter l'appli", "Uygulamayı Puanla"),
        "about" to r("About App", "О приложении", "Acerca de", "Über die App", "À propos", "Hakkında"),
        "export_report" to r("Export Calls Report", "Экспорт отчёта", "Exportar informe", "Anrufbericht exportieren", "Exporter le rapport", "Arama Raporunu Dışa Aktar"),
        "missed_reminder" to r("Missed Call Reminder", "Напоминание о пропущенных", "Recordatorio de llamadas perdidas", "Erinnerung an verpasste Anrufe", "Rappel d'appel manqué", "Cevapsız Arama Hatırlatıcı"),
        "premium_settings" to r("Premium Settings", "Премиум-настройки", "Ajustes Premium", "Premium-Einstellungen", "Paramètres Premium", "Premium Ayarları"),
        "missing_details" to r("Missing Call Details", "Недостающие данные звонков", "Detalles de llamadas faltantes", "Fehlende Anrufdetails", "Détails d'appel manquants", "Eksik Arama Ayrıntıları"),
        "remove_dialer" to r("Remove as Default Dialer", "Убрать как приложение для звонков по умолчанию", "Quitar como marcador predeterminado", "Als Standard-Telefon-App entfernen", "Retirer comme composeur par défaut", "Varsayılan Çevirici Olmaktan Çıkar"),
        "set_dialer" to r("Set as Default Dialer", "Сделать приложением для звонков по умолчанию", "Establecer como marcador predeterminado", "Als Standard-Telefon-App festlegen", "Définir comme composeur par défaut", "Varsayılan Çevirici Yap"),
        "backup_export" to r("Backup / Export Call History", "Резервная копия / экспорт истории звонков", "Copia de seguridad / exportar historial", "Anrufliste sichern / exportieren", "Sauvegarde / export de l'historique", "Arama Geçmişini Yedekle / Dışa Aktar"),
        "restore_import" to r("Restore / Import Call History", "Восстановить / импорт истории звонков", "Restaurar / importar historial", "Anrufliste wiederherstellen / importieren", "Restaurer / importer l'historique", "Arama Geçmişini Geri Yükle / İçe Aktar"),
        "delete_account" to r("Delete Account", "Удалить аккаунт", "Eliminar cuenta", "Konto löschen", "Supprimer le compte", "Hesabı Sil"),
        "sign_out" to r("Sign out", "Выйти", "Cerrar sesión", "Abmelden", "Se déconnecter", "Çıkış yap"),
        "blogs" to r("Blogs", "Блоги", "Blogs", "Blogs", "Blogs", "Bloglar"),
        "quick_call_ext" to r("Linked Quick Call Extension", "Связанное расширение Quick Call", "Extensión Quick Call vinculada", "Verknüpfte Quick-Call-Erweiterung", "Extension Quick Call liée", "Bağlı Quick Call Uzantısı"),
        "privacy_policy" to r("Privacy Policy", "Политика конфиденциальности", "Política de privacidad", "Datenschutzerklärung", "Politique de confidentialité", "Gizlilik Politikası"),
        "upgrade_title" to r("Upgrade To Premium", "Перейти на Премиум", "Mejorar a Premium", "Auf Premium upgraden", "Passer à Premium", "Premium'a Yükselt"),
        "unlock" to r("Here is what you will unlock", "Что вы получите", "Esto es lo que desbloquearás", "Das schalten Sie frei", "Voici ce que vous débloquez", "Açacağınız özellikler"),
        "choose_plan" to r("Choose a Plan", "Выберите план", "Elige un plan", "Plan wählen", "Choisissez un forfait", "Bir Plan Seçin"),
        "subscribe" to r("Subscribe", "Подписаться", "Suscribirse", "Abonnieren", "S'abonner", "Abone Ol"),
        "one_month" to r("1 Month", "1 месяц", "1 mes", "1 Monat", "1 mois", "1 Ay"),
        "trial_note" to r("7 days free trial for new subscribers only", "7 дней бесплатно только для новых подписчиков", "7 días de prueba gratis solo para nuevos suscriptores", "7 Tage kostenlos, nur für neue Abonnenten", "7 jours d'essai gratuit pour les nouveaux abonnés uniquement", "7 gün ücretsiz deneme, yalnızca yeni aboneler için"),
        "current_plan" to r("Current plan", "Текущий план", "Plan actual", "Aktueller Plan", "Forfait actuel", "Mevcut plan"),
        "history_filter" to r("History Filter", "Фильтр истории", "Filtro del historial", "Verlaufsfilter", "Filtre de l'historique", "Geçmiş Filtresi"),
        "sim_label" to r("SIM :", "SIM :", "SIM :", "SIM :", "SIM :", "SIM :"),
        "duration_label" to r("Duration :", "Длительность :", "Duración :", "Dauer :", "Durée :", "Süre :"),
        "contact_type" to r("Contact Type :", "Тип контакта :", "Tipo de contacto :", "Kontakttyp :", "Type de contact :", "Kişi Türü :"),
        "all_contacts" to r("All Contacts", "Все контакты", "Todos los contactos", "Alle Kontakte", "Tous les contacts", "Tüm Kişiler"),
        "saved_contacts" to r("Saved Contacts", "Сохранённые контакты", "Contactos guardados", "Gespeicherte Kontakte", "Contacts enregistrés", "Kayıtlı Kişiler"),
        "unsaved_contacts" to r("Unsaved Contacts", "Несохранённые контакты", "Contactos no guardados", "Nicht gespeicherte Kontakte", "Contacts non enregistrés", "Kayıtsız Kişiler"),
        "call_notes" to r("Call Notes :", "Заметки к звонкам :", "Notas de llamadas :", "Anrufnotizen :", "Notes d'appel :", "Arama Notları :"),
        "all_notes" to r("All Notes", "Все заметки", "Todas las notas", "Alle Notizen", "Toutes les notes", "Tüm Notlar"),
        "tags" to r("Tags", "Теги", "Etiquetas", "Tags", "Tags", "Etiketler"),
        "select_tags" to r("Select Tags", "Выбрать теги", "Seleccionar etiquetas", "Tags auswählen", "Choisir des tags", "Etiket Seç"),
        "agree_continue" to r("AGREE & CONTINUE", "СОГЛАСИТЬСЯ И ПРОДОЛЖИТЬ", "ACEPTAR Y CONTINUAR", "ZUSTIMMEN & WEITER", "ACCEPTER ET CONTINUER", "KABUL ET VE DEVAM ET"),
        "yes_agree" to r("Yes, I Agree", "Да, согласен", "Sí, acepto", "Ja, ich stimme zu", "Oui, j'accepte", "Evet, Kabul Ediyorum"),
        "skip" to r("SKIP", "ПРОПУСТИТЬ", "OMITIR", "ÜBERSPRINGEN", "PASSER", "ATLA"),
        "add_contacts" to r("Add Contacts", "Добавить контакты", "Añadir contactos", "Kontakte hinzufügen", "Ajouter des contacts", "Kişi Ekle"),
        "compare_hint" to r("Add contacts to compare calls and duration\n(You can add max 5 contacts)", "Добавьте контакты для сравнения звонков и длительности\n(не более 5 контактов)", "Añade contactos para comparar llamadas y duración\n(máximo 5 contactos)", "Kontakte hinzufügen, um Anrufe und Dauer zu vergleichen\n(maximal 5 Kontakte)", "Ajoutez des contacts pour comparer appels et durée\n(5 contacts maximum)", "Aramaları ve süreyi karşılaştırmak için kişi ekleyin\n(en fazla 5 kişi)"),
        "longest_call" to r("Longest Call", "Самый длинный звонок", "Llamada más larga", "Längster Anruf", "Appel le plus long", "En Uzun Arama"),
        "frequently_talked" to r("Frequently Talked", "Чаще всего общались", "Más frecuentes", "Häufig gesprochen", "Fréquemment appelé", "Sık Konuşulan"),
        "phone_call" to r("Phone Call", "Звонки", "Llamadas", "Anrufe", "Appels", "Arama"),
        "graph_view" to r("Graph View", "График", "Vista de gráfico", "Diagrammansicht", "Vue graphique", "Grafik Görünümü"),
        "theme_light" to r("Light", "Светлая", "Claro", "Hell", "Clair", "Açık"),
        "theme_dark" to r("Dark", "Тёмная", "Oscuro", "Dunkel", "Sombre", "Koyu"),
        "theme_system" to r("System default", "Как в системе", "Predeterminado del sistema", "Systemstandard", "Par défaut du système", "Sistem varsayılanı"),
        "call_history_name" to r("Call History", "История звонков", "Historial de llamadas", "Anrufliste", "Historique des appels", "Arama Geçmişi"),
        "analytics_name" to r("Analytics", "Аналитика", "Analíticas", "Analyse", "Analyses", "Analizler"),
        "dial_hint" to r("Dial a number", "Набрать номер", "Marcar un número", "Nummer wählen", "Composer un numéro", "Numara çevir"),
    )

    fun t(key: String): String {
        val row = table[key] ?: return key
        return row.getOrNull(lang.ordinal)?.takeIf { it.isNotBlank() } ?: row[0]
    }
}

/** Shorthand used all over the screens: `T("nav_history")`. */
fun T(key: String) = Strings.t(key)
