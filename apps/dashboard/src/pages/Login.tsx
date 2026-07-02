import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff, Loader2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setUser } from '@/lib/auth'
import api from '@/lib/api'

type LoginStep = 'credentials' | 'mfa'

export default function Login() {
  const navigate = useNavigate()
  const [step, setStep] = useState<LoginStep>('credentials')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('admin@secops.local')
  const [password, setPassword] = useState('admin123')
  const [mfaCode, setMfaCode] = useState('')
  const [tempToken, setTempToken] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await api.post('/auth/login', { email, password }) as any
      if (response.mfaRequired) {
        setTempToken(response.tempToken)
        setStep('mfa')
        return
      }
      setUser(response.user)
      navigate('/')
    } catch (err: any) {
      setError(err?.error || '登录失败，请检查邮箱和密码')
    } finally {
      setLoading(false)
    }
  }

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await api.post('/auth/mfa/verify', { tempToken, code: mfaCode }) as any
      setUser(response.user)
      navigate('/')
    } catch (err: any) {
      setError(err?.error || 'MFA 验证失败')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setStep('credentials')
    setMfaCode('')
    setTempToken('')
    setError('')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground text-background mb-4">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">SecPilot</h1>
          <p className="text-xs text-muted-foreground mt-1">安全运营平台</p>
        </div>

        <div className="space-y-4">
          {step === 'credentials' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9"
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-9 pr-9"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-9 text-sm"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    登录中...
                  </>
                ) : (
                  '登录'
                )}
              </Button>

              <p className="text-center text-[11px] text-muted-foreground">
                演示账户: admin@secops.local / admin123
              </p>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="text-center mb-2">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent mb-3">
                  <KeyRound className="h-5 w-5 text-foreground" />
                </div>
                <h2 className="text-sm font-semibold">两步验证</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  请输入身份验证器中的 6 位验证码
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mfa-code" className="text-xs">验证码</Label>
                <Input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  className="h-9 text-center text-lg tracking-widest font-mono"
                  disabled={loading}
                  autoFocus
                />
              </div>

              {error && (
                <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-9 text-sm"
                disabled={loading || mfaCode.length !== 6}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    验证中...
                  </>
                ) : (
                  '验证'
                )}
              </Button>

              <button
                type="button"
                onClick={handleBack}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                disabled={loading}
              >
                ← 返回密码登录
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
