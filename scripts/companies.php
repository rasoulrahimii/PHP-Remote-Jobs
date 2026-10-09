<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use Symfony\Component\Yaml\Exception\ParseException;
use Symfony\Component\Yaml\Yaml;

const DATA_FILE = __DIR__ . '/../companies.yml';
const README_FILE = __DIR__ . '/../README.md';
const TABLE_START = '<!-- companies:start -->';
const TABLE_END = '<!-- companies:end -->';
const FIELDS = ['name', 'url', 'industries', 'benefits', 'linkedin', 'glassdoor', 'last_verified'];
const TABLE_HEADER = ['Company', 'Industry', 'Benefits', 'LinkedIn', 'Glassdoor', 'Last verified'];
const DEFAULT_STALE_MONTHS = 6;

date_default_timezone_set('UTC');

final class InvalidData extends RuntimeException
{
    /**
     * @param list<string> $errors
     */
    public function __construct(public readonly array $errors)
    {
        parent::__construct(implode(PHP_EOL, $errors));
    }
}

/**
 * @return list<array{name: string, url: string, industries: list<string>, benefits: list<string>, linkedin: string, glassdoor: ?string, last_verified: string}>
 */
function loadCompanies(): array
{
    try {
        $data = Yaml::parseFile(DATA_FILE, Yaml::PARSE_DATETIME);
    } catch (ParseException $e) {
        throw new InvalidData([$e->getMessage()]);
    }

    if (!is_array($data) || !array_is_list($data) || $data === []) {
        throw new InvalidData(['The file must contain a non-empty list of companies.']);
    }

    $errors = [];
    $companies = [];
    foreach ($data as $index => $entry) {
        $label = sprintf('Entry #%d', $index + 1);
        if (is_array($entry) && is_string($entry['name'] ?? null)) {
            $label .= sprintf(' (%s)', $entry['name']);
        }

        $company = normalizeCompany($entry, $label, $errors);
        if ($company !== null) {
            $companies[] = $company;
        }
    }

    $errors = [...$errors, ...findDuplicates($companies)];
    if ($errors !== []) {
        throw new InvalidData($errors);
    }

    usort($companies, static fn (array $a, array $b): int => strcasecmp($a['name'], $b['name']));

    return $companies;
}

/**
 * @param list<string> $errors
 * @return ?array{name: string, url: string, industries: list<string>, benefits: list<string>, linkedin: string, glassdoor: ?string, last_verified: string}
 */
function normalizeCompany(mixed $entry, string $label, array &$errors): ?array
{
    if (!is_array($entry) || array_is_list($entry)) {
        $errors[] = sprintf('%s: must be a set of fields (name, url, ...).', $label);

        return null;
    }

    $errorCount = count($errors);

    foreach (array_diff(array_keys($entry), FIELDS) as $field) {
        $errors[] = sprintf('%s: unknown field "%s". Allowed fields: %s.', $label, $field, implode(', ', FIELDS));
    }

    $company = [
        'name' => text($entry, 'name', $label, $errors),
        'url' => url($entry, 'url', $label, $errors, true),
        'industries' => textList($entry, 'industries', $label, $errors, true),
        'benefits' => textList($entry, 'benefits', $label, $errors, false),
        'linkedin' => url($entry, 'linkedin', $label, $errors, true),
        'glassdoor' => url($entry, 'glassdoor', $label, $errors, false),
        'last_verified' => verifiedDate($entry, $label, $errors),
    ];

    return count($errors) === $errorCount ? $company : null;
}

/**
 * @param array<string, mixed> $entry
 * @param list<string> $errors
 */
function text(array $entry, string $field, string $label, array &$errors): ?string
{
    $value = $entry[$field] ?? null;
    if (!is_string($value) || trim($value) === '' || preg_match('/\R/', $value) === 1) {
        $errors[] = sprintf('%s: "%s" is required and must be a single line of text.', $label, $field);

        return null;
    }

    return trim($value);
}

/**
 * @param array<string, mixed> $entry
 * @param list<string> $errors
 */
function url(array $entry, string $field, string $label, array &$errors, bool $required): ?string
{
    if (!$required && ($entry[$field] ?? null) === null) {
        return null;
    }

    $value = text($entry, $field, $label, $errors);
    if ($value === null) {
        return null;
    }

    $scheme = parse_url($value, PHP_URL_SCHEME);
    if (filter_var($value, FILTER_VALIDATE_URL) === false || !in_array($scheme, ['http', 'https'], true)) {
        $errors[] = sprintf('%s: "%s" must be a valid http(s) URL, got "%s".', $label, $field, $value);

        return null;
    }

    return $value;
}

/**
 * @param array<string, mixed> $entry
 * @param list<string> $errors
 * @return list<string>
 */
function textList(array $entry, string $field, string $label, array &$errors, bool $required): array
{
    $value = $entry[$field] ?? null;
    if ($value === null && !$required) {
        return [];
    }

    if (!is_array($value) || !array_is_list($value) || $value === []) {
        $errors[] = sprintf('%s: "%s" must be a non-empty list.', $label, $field);

        return [];
    }

    $items = [];
    foreach ($value as $item) {
        if (!is_string($item) || trim($item) === '' || preg_match('/\R/', $item) === 1) {
            $errors[] = sprintf('%s: every item in "%s" must be a single line of text.', $label, $field);

            continue;
        }
        $items[] = trim($item);
    }

    return $items;
}

/**
 * @param array<string, mixed> $entry
 * @param list<string> $errors
 */
function verifiedDate(array $entry, string $label, array &$errors): ?string
{
    $value = $entry['last_verified'] ?? null;
    if (is_string($value)) {
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        $value = $parsed !== false && $parsed->format('Y-m-d') === $value ? $parsed : null;
    }

    if (!$value instanceof DateTimeInterface) {
        $errors[] = sprintf('%s: "last_verified" is required and must be a date like 2026-01-31.', $label);

        return null;
    }

    if ($value->format('Y-m-d') > (new DateTimeImmutable('tomorrow'))->format('Y-m-d')) {
        $errors[] = sprintf('%s: "last_verified" cannot be in the future.', $label);

        return null;
    }

    return $value->format('Y-m-d');
}

/**
 * @param list<array<string, mixed>> $companies
 * @return list<string>
 */
function findDuplicates(array $companies): array
{
    $errors = [];
    foreach (['name', 'url', 'linkedin'] as $field) {
        $seen = [];
        foreach ($companies as $company) {
            $key = strtolower(rtrim($company[$field], '/'));
            if (isset($seen[$key])) {
                $errors[] = sprintf('Duplicate %s "%s" in "%s" and "%s".', $field, $company[$field], $seen[$key], $company['name']);

                continue;
            }
            $seen[$key] = $company['name'];
        }
    }

    return $errors;
}

/**
 * @param list<array<string, mixed>> $companies
 */
function renderTable(array $companies): string
{
    $rows = [TABLE_HEADER];
    foreach ($companies as $company) {
        $rows[] = array_map(escapeCell(...), [
            sprintf('[%s](%s)', $company['name'], $company['url']),
            implode(', ', $company['industries']),
            $company['benefits'] === [] ? '-' : implode('; ', $company['benefits']),
            sprintf('[LinkedIn](%s)', $company['linkedin']),
            $company['glassdoor'] === null ? '-' : sprintf('[Glassdoor](%s)', $company['glassdoor']),
            $company['last_verified'],
        ]);
    }

    $widths = array_map(
        static fn (int $column): int => max(array_map(static fn (array $row): int => mb_strlen($row[$column]), $rows)),
        array_keys(TABLE_HEADER),
    );

    $formatRow = static fn (array $row): string => '| ' . implode(' | ', array_map(
        static fn (string $cell, int $width): string => $cell . str_repeat(' ', $width - mb_strlen($cell)),
        $row,
        $widths,
    )) . ' |';

    $separator = '|' . implode('|', array_map(static fn (int $width): string => str_repeat('-', $width + 2), $widths)) . '|';

    $lines = array_map($formatRow, $rows);
    array_splice($lines, 1, 0, [$separator]);

    return implode("\n", $lines);
}

function escapeCell(string $cell): string
{
    return str_replace('|', '\|', $cell);
}

function validateCommand(): int
{
    printf("companies.yml is valid (%d companies).\n", count(loadCompanies()));

    return 0;
}

function readmeCommand(bool $check): int
{
    $readme = (string) file_get_contents(README_FILE);
    $start = strpos($readme, TABLE_START);
    $end = strpos($readme, TABLE_END);
    if ($start === false || $end === false || $end < $start) {
        fwrite(STDERR, sprintf("README.md must contain %s and %s around the companies table.\n", TABLE_START, TABLE_END));

        return 1;
    }

    $updated = substr($readme, 0, $start + strlen(TABLE_START))
        . "\n" . renderTable(loadCompanies()) . "\n"
        . substr($readme, $end);

    if ($updated === $readme) {
        echo "README.md is up to date.\n";

        return 0;
    }

    if ($check) {
        fwrite(STDERR, "README.md is out of date. Run: php scripts/companies.php readme\n");

        return 1;
    }

    file_put_contents(README_FILE, $updated);
    echo "README.md updated.\n";

    return 0;
}

function jsonCommand(?string $path): int
{
    if ($path === null) {
        fwrite(STDERR, "Usage: php scripts/companies.php json <output-path>\n");

        return 1;
    }

    $json = json_encode(loadCompanies(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    file_put_contents($path, $json . "\n");
    printf("Wrote %s.\n", $path);

    return 0;
}

/**
 * @param list<string> $options
 */
function staleCommand(array $options): int
{
    $months = DEFAULT_STALE_MONTHS;
    foreach ($options as $option) {
        if (preg_match('/^--months=([1-9]\d*)$/', $option, $match) !== 1) {
            fwrite(STDERR, "Usage: php scripts/companies.php stale [--months=N]\n");

            return 1;
        }
        $months = (int) $match[1];
    }

    $cutoff = (new DateTimeImmutable('today'))->modify(sprintf('-%d months', $months))->format('Y-m-d');
    $stale = array_values(array_filter(loadCompanies(), static fn (array $company): bool => $company['last_verified'] < $cutoff));
    if ($stale === []) {
        return 0;
    }

    usort($stale, static fn (array $a, array $b): int => [$a['last_verified'], $a['name']] <=> [$b['last_verified'], $b['name']]);

    printf(
        "%d %s not been verified in the last %d months (before %s).\n\n",
        count($stale),
        count($stale) === 1 ? 'entry has' : 'entries have',
        $months,
        $cutoff,
    );
    echo "For each one, check that the company still hires remote PHP developers, then update `last_verified` in `companies.yml` or remove the entry.\n\n";
    foreach ($stale as $company) {
        printf("- [ ] [%s](%s): last verified %s\n", $company['name'], $company['url'], $company['last_verified']);
    }

    return 0;
}

function usage(int $exitCode): int
{
    fwrite($exitCode === 0 ? STDOUT : STDERR, <<<'TXT'
        Usage: php scripts/companies.php <command>

        Commands:
          validate           Check companies.yml for errors
          readme [--check]   Regenerate the README table (--check only reports if it is out of date)
          json <path>        Export the companies as JSON
          stale [--months=N] Print entries not verified in the last N months (default 6)

        TXT);

    return $exitCode;
}

/**
 * @param list<string> $argv
 */
function main(array $argv): int
{
    $arguments = array_slice($argv, 2);

    try {
        return match ($argv[1] ?? null) {
            'validate' => validateCommand(),
            'readme' => readmeCommand($arguments === ['--check']),
            'json' => jsonCommand($arguments[0] ?? null),
            'stale' => staleCommand($arguments),
            'help', '--help', '-h' => usage(0),
            default => usage(1),
        };
    } catch (InvalidData $e) {
        fwrite(STDERR, "companies.yml is invalid:\n");
        foreach ($e->errors as $error) {
            fwrite(STDERR, sprintf("  - %s\n", $error));
        }

        return 1;
    }
}

exit(main($argv));
