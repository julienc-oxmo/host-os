import { useState } from 'react'
import { useApp } from '../data/AppContext'
import { Card, Modal } from '../components/ui'
import { PageHead } from '../components/Layout'
import { PropertyForm } from '../components/PropertyForm'

export default function Onboarding() {
  const { repo, run } = useApp()
  const [open, setOpen] = useState(false)
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHead title="Bienvenue dans Host OS" subtitle="Commencez par ajouter un logement, importer vos réservations, ou explorer l’application avec des données de démonstration." />
      <div className="grid cols-2">
        <Card title="Explorer avec des données de démo" subtitle="2 logements (Paris en EUR, Mexico City en MXN), 13 mois d’historique, réservations futures, dépenses.">
          <button className="btn primary" onClick={() => run(() => repo.seedDemo(), 'Données de démo chargées')}>Charger la démo</button>
        </Card>
        <Card title="Partir de zéro" subtitle="Ajoutez votre premier logement, puis importez un CSV Airbnb.">
          <button className="btn" onClick={() => setOpen(true)}>Ajouter un logement</button>
        </Card>
      </div>
      <Modal open={open} title="Nouveau logement" onClose={() => setOpen(false)}>
        <PropertyForm onDone={() => setOpen(false)} />
      </Modal>
    </div>
  )
}

