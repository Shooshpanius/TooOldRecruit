// Скрипт для генерации version.ts из истории git.
// Запускается автоматически перед сборкой (prebuild) и запуском dev-сервера (predev).
// Гарантирует, что файл version.ts никогда не будет пустым после git clone.

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionFilePath = resolve(__dirname, '../src/version.ts');

/**
 * Читает номер и дату последнего PR из git-лога.
 * Ищет коммиты вида "chore: обновление версии — PR #N" или "Merge pull request #N".
 * @returns {{ prNumber: number, prDate: string } | null}
 */
function readVersionFromGit() {
    try {
        const log = execSync('git log --format="%s %ai" --max-count=100', {
            cwd: resolve(__dirname, '../..'),
            encoding: 'utf8',
        });

        for (const line of log.split('\n')) {
            // Ищем коммиты вида "chore: обновление версии — PR #N"
            const versionMatch = line.match(/PR #(\d+)\s+(\d{4}-\d{2}-\d{2})/);
            if (versionMatch) {
                const prNumber = parseInt(versionMatch[1], 10);
                const [year, month, day] = versionMatch[2].split('-');
                const prDate = `${day}.${month}.${year}`;
                return { prNumber, prDate };
            }

            // Запасной вариант: "Merge pull request #N from ..."
            const mergeMatch = line.match(/Merge pull request #(\d+)\s+(\d{4}-\d{2}-\d{2})/);
            if (mergeMatch) {
                const prNumber = parseInt(mergeMatch[1], 10);
                const [year, month, day] = mergeMatch[2].split('-');
                const prDate = `${day}.${month}.${year}`;
                return { prNumber, prDate };
            }
        }
    } catch {
        // git недоступен (например, в CI без истории) — продолжаем с fallback
    }
    return null;
}

/**
 * Читает текущие значения из существующего version.ts, если файл не пустой.
 * @returns {{ prNumber: number, prDate: string } | null}
 */
function readVersionFromFile() {
    if (!existsSync(versionFilePath)) return null;

    try {
        const content = readFileSync(versionFilePath, 'utf8');
        const numberMatch = content.match(/LAST_PR_NUMBER\s*=\s*(\d+)/);
        const dateMatch = content.match(/LAST_PR_DATE\s*=\s*'([^']+)'/);
        if (numberMatch && dateMatch) {
            return {
                prNumber: parseInt(numberMatch[1], 10),
                prDate: dateMatch[1],
            };
        }
    } catch {
        // Файл повреждён — используем fallback
    }
    return null;
}

// Определяем версию: сначала из git, потом из файла, потом дефолт
const fromGit = readVersionFromGit();
const fromFile = readVersionFromFile();
const version = fromGit ?? fromFile ?? { prNumber: 0, prDate: '01.01.2026' };

const content =
    `// Номер и дата последнего принятого пулл реквеста\n` +
    `export const LAST_PR_NUMBER = ${version.prNumber};\n` +
    `export const LAST_PR_DATE = '${version.prDate}';\n`;

writeFileSync(versionFilePath, content, 'utf8');
console.log(`[generate-version] version.ts обновлён: PR #${version.prNumber} от ${version.prDate}`);
