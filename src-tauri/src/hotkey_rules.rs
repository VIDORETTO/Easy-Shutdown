//! Parsing e validação de combinações de atalho (lógica pura — testável).
//! As mesmas regras existem no frontend em `src/lib/hotkeys.ts`.

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Combo {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub win: bool,
    /// Tecla normalizada: "a".."z", "0".."9", "f1".."f24", "num0".."num9",
    /// "space", "enter", "tab", "esc", "home", "end", "delete", "insert",
    /// "pageup", "pagedown", "up", "down", "left", "right".
    pub key: String,
}

const NAMED_KEYS: &[&str] = &[
    "space", "enter", "tab", "esc", "home", "end", "delete", "insert", "pageup", "pagedown", "up",
    "down", "left", "right",
];

fn normalize_key(raw: &str) -> Option<String> {
    let k = raw.trim().to_lowercase();
    let alias = match k.as_str() {
        "arrowup" => "up",
        "arrowdown" => "down",
        "arrowleft" => "left",
        "arrowright" => "right",
        "del" => "delete",
        "escape" => "esc",
        "return" => "enter",
        "espaco" | "espaço" => "space",
        other => other,
    };
    let alias = alias.strip_prefix("numpad").map(|d| format!("num{d}")).unwrap_or_else(|| alias.to_string());

    let is_char = alias.len() == 1 && alias.chars().all(|c| c.is_ascii_alphanumeric());
    let is_fkey = alias
        .strip_prefix('f')
        .and_then(|n| n.parse::<u8>().ok())
        .is_some_and(|n| (1..=24).contains(&n));
    let is_num = alias
        .strip_prefix("num")
        .is_some_and(|d| d.len() == 1 && d.chars().all(|c| c.is_ascii_digit()));
    if is_char || is_fkey || is_num || NAMED_KEYS.contains(&alias.as_str()) {
        Some(alias)
    } else {
        None
    }
}

pub fn parse_combo(s: &str) -> Result<Combo, String> {
    let mut c = Combo { ctrl: false, alt: false, shift: false, win: false, key: String::new() };
    for part in s.split('+') {
        let p = part.trim().to_lowercase();
        match p.as_str() {
            "ctrl" | "control" => c.ctrl = true,
            "alt" | "option" => c.alt = true,
            "shift" => c.shift = true,
            "win" | "super" | "meta" | "cmd" | "windows" => c.win = true,
            "" => return Err(format!("atalho inválido: '{s}'")),
            _ => {
                if !c.key.is_empty() {
                    return Err(format!("use só uma tecla além dos modificadores em '{s}'"));
                }
                c.key = normalize_key(&p).ok_or_else(|| format!("tecla não suportada: '{}'", part.trim()))?;
            }
        }
    }
    if c.key.is_empty() {
        return Err(format!("nenhuma tecla encontrada em '{s}'"));
    }
    Ok(c)
}

fn is_printable(key: &str) -> bool {
    key.len() == 1 || key == "space"
}

/// Recusa combinações perigosas ou que quebram o uso normal do PC.
pub fn validate(c: &Combo) -> Result<(), String> {
    if !(c.ctrl || c.alt || c.win) {
        return Err("Use pelo menos Ctrl, Alt ou Win.".into());
    }
    let count = [c.ctrl, c.alt, c.shift].iter().filter(|b| **b).count();
    if !c.win && count < 2 {
        return Err(
            "Combine dois modificadores (ex.: Ctrl+Shift) ou use Win — com um só modificador o atalho rouba teclas de outros programas."
                .into(),
        );
    }
    if c.ctrl && c.alt && !c.win && is_printable(&c.key) {
        return Err(
            "Ctrl+Alt+letra/número equivale a AltGr e dispararia ao digitar caracteres como / ? ° €. Use F1–F12, setas ou inclua Win."
                .into(),
        );
    }
    let reserved = (c.alt && !c.ctrl && !c.win && matches!(c.key.as_str(), "tab" | "esc" | "f4"))
        || (c.ctrl && c.shift && !c.alt && c.key == "esc")
        || (c.ctrl && c.alt && matches!(c.key.as_str(), "delete" | "tab"));
    if reserved {
        return Err("Essa combinação é reservada pelo Windows.".into());
    }
    Ok(())
}

/// Forma canônica para exibição e comparação ("Ctrl+Alt+Shift+Win+F9").
pub fn display(c: &Combo) -> String {
    let mut parts: Vec<String> = Vec::new();
    if c.ctrl {
        parts.push("Ctrl".into());
    }
    if c.alt {
        parts.push("Alt".into());
    }
    if c.shift {
        parts.push("Shift".into());
    }
    if c.win {
        parts.push("Win".into());
    }
    let key = match c.key.as_str() {
        k if k.len() == 1 => k.to_uppercase(),
        k if k.starts_with("num") => format!("Num{}", &k[3..]),
        k if k.starts_with('f') && k[1..].parse::<u8>().is_ok() => k.to_uppercase(),
        "pageup" => "PageUp".into(),
        "pagedown" => "PageDown".into(),
        k => {
            let mut ch = k.chars();
            ch.next().map(|f| f.to_uppercase().collect::<String>() + ch.as_str()).unwrap_or_default()
        }
    };
    parts.push(key);
    parts.join("+")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(s: &str) -> Result<(), String> {
        validate(&parse_combo(s)?)
    }

    #[test]
    fn parses_and_normalizes() {
        let c = parse_combo("alt + CTRL + arrowup").unwrap();
        assert_eq!(display(&c), "Ctrl+Alt+Up");
        assert_eq!(display(&parse_combo("Shift+Win+numpad5").unwrap()), "Shift+Win+Num5");
        assert_eq!(display(&parse_combo("ctrl+shift+f12").unwrap()), "Ctrl+Shift+F12");
        assert_eq!(display(&parse_combo("ctrl+alt+pagedown").unwrap()), "Ctrl+Alt+PageDown");
    }

    #[test]
    fn order_independent_equality() {
        assert_eq!(parse_combo("Alt+Ctrl+F9").unwrap(), parse_combo("Ctrl+Alt+F9").unwrap());
    }

    #[test]
    fn rejects_unsupported_keys() {
        assert!(parse_combo("Ctrl+Alt+/").is_err());
        assert!(parse_combo("Ctrl+Alt+ç").is_err());
        assert!(parse_combo("Ctrl+Alt").is_err());
        assert!(parse_combo("Ctrl+A+B").is_err());
        assert!(parse_combo("Ctrl+F25").is_err());
    }

    #[test]
    fn rejects_dangerous_combos() {
        assert!(check("Shift+A").is_err());
        assert!(check("Ctrl+C").is_err());
        assert!(check("Alt+F4").is_err());
        assert!(check("Ctrl+F9").is_err());
        // AltGr
        assert!(check("Ctrl+Alt+D").is_err());
        assert!(check("Ctrl+Alt+Q").is_err());
        assert!(check("Ctrl+Alt+Shift+S").is_err());
        assert!(check("Ctrl+Alt+1").is_err());
        // reservados
        assert!(check("Ctrl+Shift+Esc").is_err());
        assert!(check("Ctrl+Alt+Delete").is_err());
        assert!(check("Alt+Shift+Tab").is_err());
    }

    #[test]
    fn accepts_safe_combos() {
        assert!(check("Ctrl+Alt+F9").is_ok());
        assert!(check("Ctrl+Alt+End").is_ok());
        assert!(check("Ctrl+Shift+K").is_ok());
        assert!(check("Win+Alt+D").is_ok());
        assert!(check("Ctrl+Alt+Win+S").is_ok());
        assert!(check("Win+F9").is_ok());
    }
}
