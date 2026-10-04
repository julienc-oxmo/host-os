import { useState } from 'react'
import { useAuth } from '../data/AuthContext'
import { Callout, Field, Icon } from '../components/ui'

export default function Login() {
  const { signIn, signUp, magicLink } = useAuth()
  const [mode, setMode] = useState<'in' | 'up' | 'magic'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ tone: 'neg' | 'pos'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const err = mode === 'in' ? await signIn(email, password) : mode === 'up' ? await signUp(email, password) : await magicLink(email)
    setBusy(false)
    if (err === 'CHECK_EMAIL') setMsg({ tone: 'pos', text: 'Vérifiez votre boîte mail : un lien de connexion vous a été envoyé.' })
    else if (err) setMsg({ tone: 'neg', text: err })
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-hero">
          <div className="brand-mark"><Icon name="portfolio" size={22} /></div>
          <h1>Host OS</h1>
          <p className="muted" style={{ marginTop: 6 }}>Le cockpit de vos logements en location.</p>
        </div>
        <form className="card stack" onSubmit={submit}>
          <Field label="Email"><input className="input" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          {mode !== 'magic' && (
            <Field label="Mot de passe"><input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>
          )}
          {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
          <button className="btn primary" style={{ height: 40 }} disabled={busy}>
            {busy ? '…' : mode === 'in' ? 'Se connecter' : mode === 'up' ? 'Créer mon compte' : 'Recevoir un lien magique'}
          </button>
          <div className="row spread small">
            <button type="button" className="btn ghost sm" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Créer un compte' : 'J’ai déjà un compte'}</button>
            <button type="button" className="btn ghost sm" onClick={() => setMode(mode === 'magic' ? 'in' : 'magic')}>{mode === 'magic' ? 'Mot de passe' : 'Lien magique'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
