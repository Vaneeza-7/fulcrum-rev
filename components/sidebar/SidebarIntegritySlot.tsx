'use client'
import { SystemIntegrityPulse } from './SystemIntegrityPulse'

export function SidebarIntegritySlot() {
  return <SystemIntegrityPulse pollIntervalMs={60000} />
}
