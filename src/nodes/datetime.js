/**
 * DateTime node — parse, format, and manipulate dates.
 * Config: operation (format|parse|diff|add|subtract|now|toTimezone)
 *         value       — date string or timestamp (for non-'now' ops)
 *         inputFormat — input date format hint (iso|unix|unixMs|auto)
 *         outputFormat — output format string or 'iso'|'unix'|'unixMs'|'locale'
 *         addAmount    — number to add/subtract
 *         addUnit      — years|months|weeks|days|hours|minutes|seconds
 *         diffUnit     — unit for diff operation
 *         timezone     — IANA timezone name
 */

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseDate(value, inputFormat) {
  if (value == null || value === '') return null;
  if (inputFormat === 'unix') return new Date(Number(value) * 1000);
  if (inputFormat === 'unixMs') return new Date(Number(value));
  // auto or iso: try numeric first, then string parse
  if (inputFormat === 'auto' || !inputFormat) {
    const n = Number(value);
    if (!isNaN(n) && String(value).trim() !== '') {
      // heuristic: >1e10 → ms, else seconds
      return n > 1e10 ? new Date(n) : new Date(n * 1000);
    }
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatDate(d, outputFormat) {
  if (!outputFormat || outputFormat === 'iso') return d.toISOString();
  if (outputFormat === 'unix') return Math.floor(d.getTime() / 1000);
  if (outputFormat === 'unixMs') return d.getTime();
  if (outputFormat === 'locale') return d.toLocaleString();

  const pad = (n) => String(n).padStart(2, '0');
  return outputFormat
    .replace('YYYY', d.getFullYear())
    .replace('MM',   pad(d.getMonth() + 1))
    .replace('MMM',  SHORT_MONTHS[d.getMonth()])
    .replace('DD',   pad(d.getDate()))
    .replace('HH',   pad(d.getHours()))
    .replace('mm',   pad(d.getMinutes()))
    .replace('ss',   pad(d.getSeconds()));
}

const UNIT_MS = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours:   60 * 60 * 1000,
  days:    24 * 60 * 60 * 1000,
  weeks:   7 * 24 * 60 * 60 * 1000,
};

function addToDate(d, amount, unit) {
  const n = Number(amount) || 0;
  if (UNIT_MS[unit]) return new Date(d.getTime() + n * UNIT_MS[unit]);
  // months / years need calendar arithmetic
  const copy = new Date(d);
  if (unit === 'months') copy.setMonth(copy.getMonth() + n);
  else if (unit === 'years') copy.setFullYear(copy.getFullYear() + n);
  return copy;
}

function diffDates(a, b, unit) {
  const ms = a.getTime() - b.getTime();
  if (unit === 'seconds') return ms / 1000;
  if (unit === 'minutes') return ms / (60 * 1000);
  if (unit === 'hours')   return ms / (60 * 60 * 1000);
  if (unit === 'days')    return ms / (24 * 60 * 60 * 1000);
  if (unit === 'weeks')   return ms / (7 * 24 * 60 * 60 * 1000);
  if (unit === 'months')  return ms / (30.44 * 24 * 60 * 60 * 1000);
  if (unit === 'years')   return ms / (365.25 * 24 * 60 * 60 * 1000);
  return ms; // default milliseconds
}

export async function dateTime({ input, config }) {
  const {
    operation   = 'now',
    value,
    inputFormat = 'auto',
    outputFormat = 'iso',
    addAmount   = 1,
    addUnit     = 'days',
    diffUnit    = 'days',
    timezone,
  } = config || {};

  const resolvedValue = value ?? input?.value ?? input?.date ?? null;

  let resultDate;

  switch (operation) {
    case 'now': {
      resultDate = new Date();
      break;
    }

    case 'format':
    case 'parse': {
      resultDate = parseDate(resolvedValue, inputFormat);
      if (!resultDate) throw new Error(`DateTime: cannot parse value "${resolvedValue}"`);
      break;
    }

    case 'add': {
      const base = parseDate(resolvedValue, inputFormat);
      if (!base) throw new Error(`DateTime: cannot parse value "${resolvedValue}"`);
      resultDate = addToDate(base, addAmount, addUnit);
      break;
    }

    case 'subtract': {
      const base = parseDate(resolvedValue, inputFormat);
      if (!base) throw new Error(`DateTime: cannot parse value "${resolvedValue}"`);
      resultDate = addToDate(base, -Number(addAmount || 1), addUnit);
      break;
    }

    case 'diff': {
      // expects value = "date1,date2" or input.a / input.b
      const aRaw = input?.a ?? (typeof resolvedValue === 'string' ? resolvedValue.split(',')[0] : resolvedValue);
      const bRaw = input?.b ?? (typeof resolvedValue === 'string' ? resolvedValue.split(',')[1] : null);
      const dateA = parseDate(aRaw, inputFormat);
      const dateB = parseDate(bRaw, inputFormat);
      if (!dateA || !dateB) throw new Error('DateTime diff: need two parseable dates in input.a and input.b');
      const diff = diffDates(dateA, dateB, diffUnit);
      return { result: diff, unit: diffUnit, a: dateA.toISOString(), b: dateB.toISOString(), timestamp: Date.now(), iso: new Date().toISOString() };
    }

    case 'toTimezone': {
      const base = parseDate(resolvedValue, inputFormat);
      if (!base) throw new Error(`DateTime: cannot parse value "${resolvedValue}"`);
      // Return formatted in the target timezone using Intl
      const tz = timezone || 'UTC';
      const localized = base.toLocaleString('en-US', { timeZone: tz });
      return { result: localized, timestamp: base.getTime(), iso: base.toISOString(), timezone: tz };
    }

    default:
      throw new Error(`DateTime: unknown operation "${operation}"`);
  }

  let formattedResult;
  if (timezone && (operation === 'format' || operation === 'now' || operation === 'add' || operation === 'subtract')) {
    formattedResult = resultDate.toLocaleString('en-US', { timeZone: timezone });
  } else {
    formattedResult = formatDate(resultDate, outputFormat);
  }

  return {
    result:    formattedResult,
    timestamp: resultDate.getTime(),
    iso:       resultDate.toISOString(),
  };
}
