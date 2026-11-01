<p align="center">
  <strong>🌐 Langues :</strong>
  <a href="README.md">English</a> •
  <a href="README.ar.md">العربية</a> •
  <a href="README.fr.md"><strong>Français</strong></a> •
  <a href="README.es.md">Español</a>
</p>

# qawa — قوى

**La méthodologie [Superpowers](https://github.com/obra/superpowers), sans l'environnement qu'elle suppose.**

Superpowers est une excellente bibliothèque de compétences : TDD, conception avant code, revue, vérification. Mais toute sa mécanique repose sur trois fonctionnalités de l'hôte — un hook `SessionStart`, un outil `Skill` et des outils `subagent`. De nombreux environnements (dont **Arena.ai Agent Mode**) n'en possèdent aucune, l'outil devient alors silencieux : rien ne le déclenche, rien ne le rappelle à l'agent.

**qawa conserve la méthodologie et remplace la mécanique par des éléments disponibles partout : des fichiers, une ligne à coller, et un CLI.**

```console
$ qawa boot
Lisez /path/to/qawa/bootstrap/ROUTER.md et faites le nécessaire. Mode : FAST
```

C'est tout ce dont vous avez besoin. Collez cette ligne au début de chaque session, l'agent lira le routeur et chargera la bonne compétence.

---

## Pourquoi qawa, et pas Superpowers tel quel ?

|  | Superpowers sur Claude Code | Superpowers sur Arena | **qawa** |
|---|---|---|---|
| Déclenchement auto | ✅ Hook `SessionStart` | ❌ Pas de hooks | ⚠️ Une ligne de vous |
| Charger une compétence | ✅ Outil `Skill` | ❌ | ✅ `qawa use` |
| Revue indépendante par tâche | ✅ subagent | ❌ | ❌ (auto-revue déclarée) |
| Mémoire entre sessions | ⚠️ via `compact` | ❌ | ✅ Registre fichier |
| Coût au démarrage | ~3k tokens | ~35k tokens (tout charger) | **~1.4k tokens** |
| Dépendances | Hôte | Hôte | **Python 3.9+ uniquement** |

Routeur : **1 425 tokens** vs **28 859** pour charger toutes les compétences — **économie 20×** (68× mesuré en production : 1,1k vs 75k).

---

## Installation

Aucune installation nécessaire. Copiez le dossier et lancez :

```bash
git clone https://github.com/supermorkat/qawa-arena.git qawa
cd qawa && ./qawa version
```

Ou ajoutez-le à votre PATH :

```bash
export PATH="$PATH:/path/to/qawa"
qawa doctor
```

**Seule exigence : Python 3.9+.** Pas de `pip install`, pas de dépendances, pas de réseau.

Vérifiez votre environnement :

```bash
qawa doctor
# [OK] Python 3.9+ — 3.13.16
# [OK] Index des compétences _index.json
# [OK] Fichiers de compétences présents
# [OK] git
```

---

## Utilisation

```bash
qawa boot                      # La ligne à coller au début de chaque session
qawa route "ajouter une fonctionnalité"  # Quelle compétence s'applique ?
qawa use brainstorming          # Lire la compétence
qawa skills --all               # Index (+ indisponibles)
qawa note "Task 3: complete"    # Journaliser après chaque tâche
qawa state                      # Où en sommes-nous ?
qawa mode full                  # Changer de mode
qawa brief plan.md 3            # Extraire une tâche vers un fichier
qawa review HEAD~3 HEAD         # Package de revue (commits+stat+diff)
qawa init ./my-project          # Initialiser un projet
qawa gen                        # Régénérer après modification de l'index
qawa doctor                     # Diagnostic
```

### Dans votre projet

```bash
qawa init ./my-project     # Crée .qawa/, AGENTS.md, docs/, entrées .gitignore
```

`AGENTS.md` à la racine est le filet de sécurité : même si vous oubliez de mentionner qawa, l'agent le voit et lit les règles.

### Deux modes

|  | `FAST` (par défaut) | `FULL` |
|---|---|---|
| Pour | Petit changement, prototype, script | Fonctionnalité, projet, repo d'équipe |
| Parcours | TDD + vérification uniquement | Conception → worktree → plan → exécution → revue → clôture |

**Montée automatique :** si le travail grandit, l'agent s'arrête, le signale et passe en `FULL`.

---

## Le Registre — L'habitude la plus importante

La mémoire entre sessions est **uniquement par fichiers**. Mettez à jour le registre après chaque tâche, pas à la fin :

```bash
qawa note "Task 3: complete (commits fcb8619..832591b, review clean)"
qawa note "Ruling: Les nombres sont normalisés par défaut"
```

Sans registre, toute interruption (nouvelle session, compaction de contexte) signifie **refaire du travail déjà accompli** — l'échec le plus coûteux, documenté par Superpowers elle-même.

---

## Architecture

```
qawa/
├── qawa                    # Point d'entrée — pas d'installation
├── src/qawa/
│   ├── match.py            # Normalisation arabe/latine pour la correspondance
│   ├── index.py            # Lecture & validation de skills/_index.json
│   ├── router.py           # Correspondance pondérée (remplace Skill)
│   ├── state.py            # Registre résistant aux pannes
│   ├── render.py           # Génère ROUTER/BOOTSTRAP/AGENTS
│   ├── brief.py            # Brief de tâche + package de revue
│   ├── doctor.py           # Diagnostic
│   └── cli.py
├── skills/                 # Compétences Superpowers verbatim (MIT)
│   └── _index.json         # Données qawa : mots-clés & poids ← source de vérité
├── skills-unavailable/     # Compétences nécessitant subagent (isolées)
├── bootstrap/              # ROUTER.md, BOOTSTRAP.md  ← générés
├── AGENTS.md               # ← généré
├── templates/              # Modèles de conception & plan
└── tests/                  # 347 tests
```

**Règle de conception :** les compétences originales dans `skills/` ne sont **jamais modifiées**. Tous les overrides restent dans `skills/_index.json` et `bootstrap/ROUTER.md`.

### Comment fonctionne le routage

| Type de mot-clé | Règle | Pourquoi |
|---|---|---|
| Arabe | Sous-chaîne du texte normalisé | La morphologie empêche la correspondance exacte |
| Multi-mots (`ne marche pas`) | Sous-chaîne du texte normalisé | La normalisation unifie les espaces |
| Latin (≥4 lettres) | Mot exact ou préfixe | `test` trouve `tests` |
| Latin (<4 lettres) | Correspondance exacte uniquement | `add` ne doit pas se déclencher dans `address` |

Aucune correspondance → `brainstorming` par défaut avec `score = 0`.

---

## Développement

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -t .     # 347 tests
PYTHONPATH=src python3 -m coverage run --source=src/qawa -m unittest discover -s tests -t .
python3 -m coverage report -m                                  # 95%
```

Ce projet a été construit avec la méthodologie qu'il porte : conception → plan → TDD → revue → clôture. Docs dans `docs/`.

---

## Support multi-plateformes

| Domaine | Méthode | État |
|---|---|---|
| Verrouillage du registre | `fcntl.flock` sur POSIX, `msvcrt.locking` sur Windows, fallback fichier marqueur | Conçu ; testé sur Linux |
| Écriture atomique | Fichier temp frère + `os.replace` | Testé sur Linux ; atomique sur les deux |
| Confinement des chemins | `Path.resolve()` puis `os.path.normcase` | Testé sur Linux ; conçu pour Windows |
| Imports conditionnels | `fcntl`/`msvcrt` dans les fonctions | Vérifié |
| Encodage | `encoding="utf-8"` explicite partout | Testé |

Voir [`docs/PLATFORM_SUPPORT.md`](docs/PLATFORM_SUPPORT.md) pour les détails.

---

## Limites — Ce que qawa ne fait PAS

- **Pas de revue parallèle.** `subagent-driven-development` est isolé dans `skills-unavailable/` car il nécessite subagent. L'alternative est une auto-revue **déclarée** dans le registre.
- **Rien ne se lance automatiquement.** Pas de hooks. La première ligne est à vous.
- **Compagnon visuel manuel.** Le serveur d'aperçu n'apparaît pas auto dans le cloud ; alternative : fichier HTML statique.

---

## Vérifié pour Agent Arena

Testé dans Arena.ai Agent Mode (Python 3.13, Linux) :

- **347 tests réussis** (2 ignorés — Windows uniquement)
- **Routeur :** ~1,1k tokens vs ~75k pour toutes les compétences (économie 68×)
- **Registre :** Écritures concurrentes préservées, écriture atomique
- **Sécurité :** Confinement des chemins + détection de secrets
- **Arabe :** Normalisation complète

---

## Licence

- **qawa** : MIT — voir [`LICENSE`](LICENSE).
- **`skills/` & `skills-unavailable/`** : Copie verbatim de [obra/superpowers](https://github.com/obra/superpowers) par Jesse Vincent et Prime Radiant, également MIT.

---

> **qawa** = قوى (arabe pour « pouvoirs »). Même mot, sans suppositions sur l'hôte.
