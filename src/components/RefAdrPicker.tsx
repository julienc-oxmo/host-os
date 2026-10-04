import { useApp } from '../data/AppContext'
import { Segmented } from './ui'
import { REF_ADR_LABELS } from '../lib/metrics'
import type { RefAdr } from '../lib/types'

export function RefAdrPicker() {
  const { refAdr, setRefAdr } = useApp()
  return (
    <div className="row wrap">
      <span className="small muted">ADR de référence</span>
      <Segmented<RefAdr> value={refAdr} onChange={setRefAdr} options={(Object.keys(REF_ADR_LABELS) as RefAdr[]).map((k) => ({ key: k, label: REF_ADR_LABELS[k].replace('Moyenne ', '') }))} />
    </div>
  )
}
