/**
 * Skill / template loader — adapted from nexu-io/html-anything loader.ts
 *
 * File-based skill registry. Each template is a folder:
 *   skills/<id>/
 *     SKILL.md      — frontmatter (name, scenario, tags, …) + prompt body
 *     example.md    — (optional) sample input content
 *     example.html  — (optional) pre-rendered preview
 *
 * Adding a template = adding a folder. No code change required.
 */

import fs from "node:fs";
import path from "node:path";

export type SkillFrontmatter = {
  name?: string;
  zh_name?: string;
  en_name?: string;
  emoji?: string;
  description?: string;
  category?: string;
  scenario?: string;
  aspect_hint?: string;
  featured?: number;
  tags?: string[];
  example_id?: string;
  example_name?: string;
  example_format?: string;
  example_tagline?: string;
  example_desc?: string;
};

export type SkillExampleMeta = {
  id: string;
  name: string;
  format: string;
  tagline: string;
  desc: string;
  hasHtml: boolean;
  hasMd: boolean;
};

export type SkillMeta = {
  id: string;
  zhName: string;
  enName: string;
  emoji: string;
  description: string;
  category: string;
  scenario: string;
  aspectHint: string;
  featured?: number;
  tags: string[];
  example?: SkillExampleMeta;
};

export type LoadedSkill = SkillMeta & {
  body: string;
  exampleMd?: string;
  exampleHtml?: string;
};

// ─── frontmatter parser ──────────────────────────────────────────────

function parseFrontmatter(raw: string): { fm: SkillFrontmatter; body: string } {
  const m = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/m.exec(raw);
  if (!m) return { fm: {}, body: raw };
  const block = m[1]!;
  const body = m[2] ?? "";
  const fm: SkillFrontmatter = {};

  for (const line of block.split(/\r?\n/)) {
    const mm = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!mm) continue;
    const key = mm[1]!;
    let val: string = mm[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    }
    switch (key) {
      case "featured": {
        const n = Number(val);
        if (Number.isFinite(n)) fm.featured = n;
        break;
      }
      case "tags": {
        const arr = /^\[(.*)\]$/.exec(val);
        if (arr) {
          fm.tags = arr[1]!
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
        }
        break;
      }
      case "name":
      case "zh_name":
      case "en_name":
      case "emoji":
      case "description":
      case "category":
      case "scenario":
      case "aspect_hint":
      case "example_id":
      case "example_name":
      case "example_format":
      case "example_tagline":
      case "example_desc":
        (fm as Record<string, string>)[key] = val;
        break;
    }
  }
  return { fm, body: body.trim() };
}

function safeRead(p: string): string | undefined {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return undefined;
  }
}

function fmToMeta(id: string, fm: SkillFrontmatter, hasHtml: boolean, hasMd: boolean): SkillMeta {
  const meta: SkillMeta = {
    id,
    zhName: fm.zh_name ?? fm.name ?? id,
    enName: fm.en_name ?? id,
    emoji: fm.emoji ?? "📊",
    description: fm.description ?? "",
    category: fm.category ?? "data",
    scenario: fm.scenario ?? "survey",
    aspectHint: fm.aspect_hint ?? "",
    tags: Array.isArray(fm.tags) ? fm.tags : [],
  };
  if (typeof fm.featured === "number") meta.featured = fm.featured;
  if (fm.example_id || hasMd || hasHtml) {
    meta.example = {
      id: fm.example_id ?? `example-${id}`,
      name: fm.example_name ?? `${meta.zhName} example`,
      format: fm.example_format ?? "csv",
      tagline: fm.example_tagline ?? "",
      desc: fm.example_desc ?? "",
      hasHtml,
      hasMd,
    };
  }
  return meta;
}

function loadSkillFromDir(id: string, dir: string): LoadedSkill | null {
  const raw = safeRead(path.join(dir, "SKILL.md"));
  if (!raw) return null;
  const { fm, body } = parseFrontmatter(raw);
  const exampleMd = safeRead(path.join(dir, "example.md"));
  const exampleHtml = safeRead(path.join(dir, "example.html"));
  const meta = fmToMeta(id, fm, !!exampleHtml, !!exampleMd);
  return { ...meta, body, exampleMd, exampleHtml };
}

// ─── public surface ──────────────────────────────────────────────────

/**
 * Load a skill from a specific directory.
 */
export function loadSkill(skillDir: string, id?: string): LoadedSkill | null {
  const resolvedId = id ?? path.basename(skillDir);
  return loadSkillFromDir(resolvedId, skillDir);
}

/**
 * List all skills from a root directory.
 */
export function listSkills(skillsRoot: string): SkillMeta[] {
  const out: SkillMeta[] = [];
  let dirents: fs.Dirent[] = [];
  try {
    dirents = fs.readdirSync(skillsRoot, { withFileTypes: true });
  } catch {
    dirents = [];
  }
  for (const ent of dirents) {
    if (!ent.isDirectory()) continue;
    const id = ent.name;
    const skillDir = path.join(skillsRoot, id);
    const raw = safeRead(path.join(skillDir, "SKILL.md"));
    if (!raw) continue;
    const { fm } = parseFrontmatter(raw);
    const hasHtml = fs.existsSync(path.join(skillDir, "example.html"));
    const hasMd = fs.existsSync(path.join(skillDir, "example.md"));
    const meta = fmToMeta(id, fm, hasHtml, hasMd);
    out.push(meta);
  }
  return out;
}
