'use client'

interface TimezoneSelectorProps {
  value: string
  onChange: (tz: string) => void
}

const TIMEZONE_GROUPS = [
  {
    label: 'United States',
    zones: [
      { iana: 'America/New_York', name: 'Eastern Time' },
      { iana: 'America/Chicago', name: 'Central Time' },
      { iana: 'America/Denver', name: 'Mountain Time' },
      { iana: 'America/Los_Angeles', name: 'Pacific Time' },
      { iana: 'America/Anchorage', name: 'Alaska Time' },
      { iana: 'Pacific/Honolulu', name: 'Hawaii Time' },
    ],
  },
  {
    label: 'Americas',
    zones: [
      { iana: 'America/Toronto', name: 'Toronto' },
      { iana: 'America/Bogota', name: 'Bogota' },
      { iana: 'America/Sao_Paulo', name: 'Sao Paulo' },
      { iana: 'America/Argentina/Buenos_Aires', name: 'Buenos Aires' },
      { iana: 'America/Mexico_City', name: 'Mexico City' },
    ],
  },
  {
    label: 'Europe',
    zones: [
      { iana: 'Europe/London', name: 'London' },
      { iana: 'Europe/Paris', name: 'Paris' },
      { iana: 'Europe/Berlin', name: 'Berlin' },
      { iana: 'Europe/Amsterdam', name: 'Amsterdam' },
      { iana: 'Europe/Madrid', name: 'Madrid' },
      { iana: 'Europe/Rome', name: 'Rome' },
      { iana: 'Europe/Zurich', name: 'Zurich' },
    ],
  },
  {
    label: 'Asia / Pacific',
    zones: [
      { iana: 'Asia/Tokyo', name: 'Tokyo' },
      { iana: 'Asia/Shanghai', name: 'Shanghai' },
      { iana: 'Asia/Singapore', name: 'Singapore' },
      { iana: 'Asia/Mumbai', name: 'Mumbai' },
      { iana: 'Asia/Dubai', name: 'Dubai' },
      { iana: 'Australia/Sydney', name: 'Sydney' },
      { iana: 'Pacific/Auckland', name: 'Auckland' },
    ],
  },
] as const

export function TimezoneSelector({ value, onChange }: TimezoneSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-600 focus:border-cyan-600"
    >
      {TIMEZONE_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.zones.map((zone) => (
            <option key={zone.iana} value={zone.iana}>
              {zone.name} ({zone.iana})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
