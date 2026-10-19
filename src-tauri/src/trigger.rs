//! Cálculo de horários das tarefas (lógica pura, sem Tauri/Win32 — testável).

use chrono::{DateTime, Datelike, Duration, LocalResult, NaiveDate, NaiveDateTime, TimeZone};

pub fn parse_hhmm(s: &str) -> Result<(u32, u32), String> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return Err(format!("formato inválido: '{s}', use HH:MM"));
    }
    let h: u32 = parts[0].trim().parse().map_err(|_| "hora não numérica")?;
    let m: u32 = parts[1].trim().parse().map_err(|_| "minuto não numérico")?;
    if h > 23 || m > 59 {
        return Err("hora/minuto fora do intervalo".into());
    }
    Ok((h, m))
}

pub fn parse_date(s: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").map_err(|_| format!("data inválida: '{s}'"))
}

/// Converte data/hora local em instante. Horário ambíguo (fim do horário de verão)
/// usa a primeira ocorrência; horário inexistente (início) avança 1h.
pub fn resolve<Tz: TimeZone>(tz: &Tz, naive: NaiveDateTime) -> Option<DateTime<Tz>> {
    match tz.from_local_datetime(&naive) {
        LocalResult::Single(d) => Some(d),
        LocalResult::Ambiguous(first, _) => Some(first),
        LocalResult::None => match tz.from_local_datetime(&(naive + Duration::hours(1))) {
            LocalResult::Single(d) | LocalResult::Ambiguous(d, _) => Some(d),
            LocalResult::None => None,
        },
    }
}

/// Instante (ms) de uma data + HH:MM locais.
pub fn at_ms<Tz: TimeZone>(tz: &Tz, date: NaiveDate, h: u32, m: u32) -> Option<i64> {
    resolve(tz, date.and_hms_opt(h, m, 0)?).map(|d| d.timestamp_millis())
}

/// Próxima ocorrência semanal estritamente depois de `after`.
/// `days`: 0 = domingo … 6 = sábado.
pub fn next_weekly<Tz: TimeZone>(
    tz: &Tz,
    h: u32,
    m: u32,
    days: &[u8],
    after: &DateTime<Tz>,
) -> Option<DateTime<Tz>> {
    if days.is_empty() {
        return None;
    }
    let start = after.date_naive();
    for offset in 0..=7 {
        let date = start + Duration::days(offset);
        let wd = date.weekday().num_days_from_sunday() as u8;
        if !days.contains(&wd) {
            continue;
        }
        let Some(naive) = date.and_hms_opt(h, m, 0) else { continue };
        let Some(dt) = resolve(tz, naive) else { continue };
        if dt > *after {
            return Some(dt);
        }
    }
    None
}

/// Normaliza a lista de dias (ordena, remove duplicados) e valida.
pub fn normalize_days(days: &[u8]) -> Result<Vec<u8>, String> {
    let mut v: Vec<u8> = days.to_vec();
    if v.iter().any(|d| *d > 6) {
        return Err("dia da semana inválido".into());
    }
    v.sort_unstable();
    v.dedup();
    if v.is_empty() {
        return Err("escolha pelo menos um dia da semana".into());
    }
    Ok(v)
}

/// Texto curto para tempo restante ("1h05min", "4min10s", "9s").
pub fn format_remaining(seconds: i64) -> String {
    let s = seconds.max(0) as u64;
    let h = s / 3600;
    let m = (s % 3600) / 60;
    let sec = s % 60;
    if h > 0 {
        format!("{h}h{m:02}min")
    } else if m > 0 {
        format!("{m}min{sec:02}s")
    } else {
        format!("{sec}s")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    fn tz() -> FixedOffset {
        FixedOffset::west_opt(3 * 3600).unwrap() // UTC-3 (Brasília)
    }

    fn dt(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> DateTime<FixedOffset> {
        tz().with_ymd_and_hms(y, mo, d, h, mi, 0).unwrap()
    }

    #[test]
    fn parse_hhmm_valid_and_invalid() {
        assert_eq!(parse_hhmm("07:05"), Ok((7, 5)));
        assert_eq!(parse_hhmm("23:59"), Ok((23, 59)));
        assert!(parse_hhmm("24:00").is_err());
        assert!(parse_hhmm("12:60").is_err());
        assert!(parse_hhmm("1205").is_err());
        assert!(parse_hhmm("aa:bb").is_err());
    }

    #[test]
    fn parse_date_works() {
        assert_eq!(parse_date("2026-10-19").unwrap(), NaiveDate::from_ymd_opt(2026, 10, 19).unwrap());
        assert!(parse_date("19/10/2026").is_err());
    }

    #[test]
    fn weekly_same_day_later() {
        // 2026-10-19 é segunda-feira (1)
        let after = dt(2026, 10, 19, 10, 0);
        let next = next_weekly(&tz(), 23, 0, &[1], &after).unwrap();
        assert_eq!(next, dt(2026, 10, 19, 23, 0));
    }

    #[test]
    fn weekly_same_day_already_passed_goes_next_week() {
        let after = dt(2026, 10, 19, 23, 0); // exatamente no horário → próxima semana
        let next = next_weekly(&tz(), 23, 0, &[1], &after).unwrap();
        assert_eq!(next, dt(2026, 10, 26, 23, 0));
    }

    #[test]
    fn weekly_weekdays_skips_weekend() {
        // sexta 2026-10-23 às 23:30 → próxima é segunda 26 às 22:00
        let after = dt(2026, 10, 23, 23, 30);
        let next = next_weekly(&tz(), 22, 0, &[1, 2, 3, 4, 5], &after).unwrap();
        assert_eq!(next, dt(2026, 10, 26, 22, 0));
    }

    #[test]
    fn weekly_every_day_tomorrow() {
        let after = dt(2026, 10, 19, 8, 0);
        let next = next_weekly(&tz(), 7, 30, &[0, 1, 2, 3, 4, 5, 6], &after).unwrap();
        assert_eq!(next, dt(2026, 10, 20, 7, 30));
    }

    #[test]
    fn weekly_empty_days_is_none() {
        assert!(next_weekly(&tz(), 7, 30, &[], &dt(2026, 10, 19, 8, 0)).is_none());
    }

    #[test]
    fn normalize_days_rules() {
        assert_eq!(normalize_days(&[5, 1, 1, 3]).unwrap(), vec![1, 3, 5]);
        assert!(normalize_days(&[]).is_err());
        assert!(normalize_days(&[7]).is_err());
    }

    #[test]
    fn at_ms_matches_offset() {
        let d = NaiveDate::from_ymd_opt(2026, 10, 19).unwrap();
        assert_eq!(at_ms(&tz(), d, 12, 0).unwrap(), dt(2026, 10, 19, 12, 0).timestamp_millis());
    }

    #[test]
    fn format_remaining_shapes() {
        assert_eq!(format_remaining(3900), "1h05min");
        assert_eq!(format_remaining(250), "4min10s");
        assert_eq!(format_remaining(9), "9s");
        assert_eq!(format_remaining(-5), "0s");
    }
}
