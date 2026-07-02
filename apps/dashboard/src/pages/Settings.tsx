import { useState, useEffect } from 'react'
import {
  Settings as SettingsIcon,
  ShieldAlert,
  Bell,
  Plug,
  Save,
  CheckCircle2,
  AlertCircle,
  User,
  KeyRound,
  QrCode,
  ShieldCheck,
  Loader2,
} from 'lucide-react'
import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfigs, useUpdateConfig } from '@/hooks/useConfig'
import { getUser, setUser } from '@/lib/auth'
import api from '@/lib/api'
import type { ConfigCategory, SystemConfig } from '@/types'

function ConfigSection({
  config,
  onSave,
  isSaving,
  children,
}: {
  config?: SystemConfig
  onSave: (value: Record<string, unknown>) => void
  isSaving: boolean
  children: (value: Record<string, unknown>, setValue: (v: Record<string, unknown>) => void) => React.ReactNode
}) {
  const [localValue, setLocalValue] = useState<Record<string, unknown>>(config?.value || {})
  const [dirty, setDirty] = useState(false)

  const handleChange = (updates: Record<string, unknown>) => {
    setLocalValue({ ...localValue, ...updates })
    setDirty(true)
  }

  const handleSave = () => {
    onSave(localValue)
    setDirty(false)
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{config.description || config.key}</CardTitle>
            <CardDescription className="font-mono text-xs">{config.key}</CardDescription>
          </div>
          {dirty && (
            <Badge variant="warning" className="text-xs">未保存</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          {children(localValue, handleChange)}
        </div>
        <div className="flex justify-end mt-4 pt-4 border-t border-border">
          <Button size="sm" onClick={handleSave} disabled={!dirty || isSaving}>
            <Save className="h-4 w-4 mr-1.5" />
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function GeneralSettings({ configs }: { configs: SystemConfig[] }) {
  const platformConfig = configs.find((c) => c.key === 'general.platform')
  const updatePlatform = useUpdateConfig('general.platform')

  return (
    <div className="space-y-4">
      <ConfigSection
        config={platformConfig}
        onSave={(v) => updatePlatform.mutate(v)}
        isSaving={updatePlatform.isPending}
      >
        {(value, setValue) => (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>平台名称</Label>
                <Input
                  value={(value.name as string) || ''}
                  onChange={(e) => setValue({ name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>版本号</Label>
                <Input
                  value={(value.version as string) || ''}
                  onChange={(e) => setValue({ version: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>时区</Label>
              <Input
                value={(value.timezone as string) || ''}
                onChange={(e) => setValue({ timezone: e.target.value })}
              />
            </div>
          </>
        )}
      </ConfigSection>
    </div>
  )
}

function SecuritySettings({ configs }: { configs: SystemConfig[] }) {
  const policyConfig = configs.find((c) => c.key === 'general.security_policy')
  const updatePolicy = useUpdateConfig('general.security_policy')

  return (
    <div className="space-y-4">
      <ConfigSection
        config={policyConfig}
        onSave={(v) => updatePolicy.mutate(v)}
        isSaving={updatePolicy.isPending}
      >
        {(value, setValue) => (
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Critical 漏洞阻断</p>
                <p className="text-xs text-muted-foreground">Critical 级别漏洞直接阻断流水线</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={value.criticalBlocking as boolean}
                  onChange={(e) => setValue({ criticalBlocking: e.target.checked })}
                />
                <div className="w-9 h-5 rounded-full bg-border peer-checked:bg-foreground/80 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-border/50">
              <div>
                <p className="text-sm font-medium">High 漏洞阻断</p>
                <p className="text-xs text-muted-foreground">High 级别漏洞直接阻断流水线</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={value.highBlocking as boolean}
                  onChange={(e) => setValue({ highBlocking: e.target.checked })}
                />
                <div className="w-9 h-5 rounded-full bg-border peer-checked:bg-foreground/80 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-border/50">
              <div>
                <p className="text-sm font-medium">Medium 漏洞阻断</p>
                <p className="text-xs text-muted-foreground">Medium 级别漏洞是否阻断流水线</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={value.mediumBlocking as boolean}
                  onChange={(e) => setValue({ mediumBlocking: e.target.checked })}
                />
                <div className="w-9 h-5 rounded-full bg-border peer-checked:bg-foreground/80 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
              <div className="space-y-2">
                <Label>Medium 宽限期 (天)</Label>
                <Input
                  type="number"
                  value={value.mediumGraceDays as number}
                  onChange={(e) => setValue({ mediumGraceDays: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Low 宽限期 (天)</Label>
                <Input
                  type="number"
                  value={value.lowGraceDays as number}
                  onChange={(e) => setValue({ lowGraceDays: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-border/50">
              <div>
                <p className="text-sm font-medium">自动去重</p>
                <p className="text-xs text-muted-foreground">基于 CWE + 路径 + 参数散列自动去重</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={value.autoDedup as boolean}
                  onChange={(e) => setValue({ autoDedup: e.target.checked })}
                />
                <div className="w-9 h-5 rounded-full bg-border peer-checked:bg-foreground/80 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
              </label>
            </div>
          </div>
        )}
      </ConfigSection>
    </div>
  )
}

function NotificationSettings({ configs }: { configs: SystemConfig[] }) {
  const emailConfig = configs.find((c) => c.key === 'notification.email')
  const slackConfig = configs.find((c) => c.key === 'notification.slack')
  const pagerdutyConfig = configs.find((c) => c.key === 'notification.pagerduty')

  const updateEmail = useUpdateConfig('notification.email')
  const updateSlack = useUpdateConfig('notification.slack')
  const updatePagerduty = useUpdateConfig('notification.pagerduty')

  return (
    <div className="space-y-4">
      <ConfigSection
        config={emailConfig}
        onSave={(v) => updateEmail.mutate(v)}
        isSaving={updateEmail.isPending}
      >
        {(value, setValue) => (
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">启用邮件通知</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={value.enabled as boolean}
                  onChange={(e) => setValue({ enabled: e.target.checked })}
                />
                <div className="w-9 h-5 rounded-full bg-border peer-checked:bg-foreground/80 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
              <div className="space-y-2">
                <Label>SMTP 服务器</Label>
                <Input
                  value={(value.host as string) || ''}
                  onChange={(e) => setValue({ host: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>端口</Label>
                <Input
                  type="number"
                  value={value.port as number}
                  onChange={(e) => setValue({ port: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>用户名</Label>
                <Input
                  value={(value.user as string) || ''}
                  onChange={(e) => setValue({ user: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>发件人地址</Label>
                <Input
                  value={(value.from as string) || ''}
                  onChange={(e) => setValue({ from: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </ConfigSection>

      <ConfigSection
        config={slackConfig}
        onSave={(v) => updateSlack.mutate(v)}
        isSaving={updateSlack.isPending}
      >
        {(value, setValue) => (
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">启用 Slack 通知</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={value.enabled as boolean}
                  onChange={(e) => setValue({ enabled: e.target.checked })}
                />
                <div className="w-9 h-5 rounded-full bg-border peer-checked:bg-foreground/80 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label>Webhook URL</Label>
              <Input
                value={(value.webhookUrl as string) || ''}
                onChange={(e) => setValue({ webhookUrl: e.target.value })}
                placeholder="https://hooks.slack.com/services/..."
              />
            </div>
            <div className="space-y-2">
              <Label>默认频道</Label>
              <Input
                value={(value.channel as string) || ''}
                onChange={(e) => setValue({ channel: e.target.value })}
              />
            </div>
          </div>
        )}
      </ConfigSection>

      <ConfigSection
        config={pagerdutyConfig}
        onSave={(v) => updatePagerduty.mutate(v)}
        isSaving={updatePagerduty.isPending}
      >
        {(value, setValue) => (
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">启用 PagerDuty</p>
                <p className="text-xs text-muted-foreground">Critical 告警触发 PagerDuty 升级</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={value.enabled as boolean}
                  onChange={(e) => setValue({ enabled: e.target.checked })}
                />
                <div className="w-9 h-5 rounded-full bg-border peer-checked:bg-foreground/80 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
              <div className="space-y-2">
                <Label>集成密钥</Label>
                <Input
                  type="password"
                  value={(value.integrationKey as string) || ''}
                  onChange={(e) => setValue({ integrationKey: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>触发级别</Label>
                <Input
                  value={(value.severity as string) || ''}
                  onChange={(e) => setValue({ severity: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </ConfigSection>
    </div>
  )
}

function IntegrationSettings({ configs }: { configs: SystemConfig[] }) {
  const ddConfig = configs.find((c) => c.key === 'integration.defectdojo')
  const glConfig = configs.find((c) => c.key === 'integration.gitlab')
  const sqConfig = configs.find((c) => c.key === 'integration.sonarqube')

  const updateDd = useUpdateConfig('integration.defectdojo')
  const updateGl = useUpdateConfig('integration.gitlab')
  const updateSq = useUpdateConfig('integration.sonarqube')

  return (
    <div className="space-y-4">
      <ConfigSection
        config={ddConfig}
        onSave={(v) => updateDd.mutate(v)}
        isSaving={updateDd.isPending}
      >
        {(value, setValue) => (
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">DefectDojo 集成</p>
                <p className="text-xs text-muted-foreground">漏洞管理与去重引擎</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={value.enabled as boolean}
                  onChange={(e) => setValue({ enabled: e.target.checked })}
                />
                <div className="w-9 h-5 rounded-full bg-border peer-checked:bg-foreground/80 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label>Base URL</Label>
              <Input
                value={(value.baseUrl as string) || ''}
                onChange={(e) => setValue({ baseUrl: e.target.value })}
                placeholder="https://defectdojo.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                value={(value.apiKey as string) || ''}
                onChange={(e) => setValue({ apiKey: e.target.value })}
              />
            </div>
          </div>
        )}
      </ConfigSection>

      <ConfigSection
        config={glConfig}
        onSave={(v) => updateGl.mutate(v)}
        isSaving={updateGl.isPending}
      >
        {(value, setValue) => (
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">GitLab 集成</p>
                <p className="text-xs text-muted-foreground">强制合规流水线与项目同步</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={value.enabled as boolean}
                  onChange={(e) => setValue({ enabled: e.target.checked })}
                />
                <div className="w-9 h-5 rounded-full bg-border peer-checked:bg-foreground/80 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label>Base URL</Label>
              <Input
                value={(value.baseUrl as string) || ''}
                onChange={(e) => setValue({ baseUrl: e.target.value })}
                placeholder="https://gitlab.example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>访问令牌</Label>
                <Input
                  type="password"
                  value={(value.token as string) || ''}
                  onChange={(e) => setValue({ token: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>组 ID</Label>
                <Input
                  value={(value.groupId as string) || ''}
                  onChange={(e) => setValue({ groupId: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </ConfigSection>

      <ConfigSection
        config={sqConfig}
        onSave={(v) => updateSq.mutate(v)}
        isSaving={updateSq.isPending}
      >
        {(value, setValue) => (
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">SonarQube 集成</p>
                <p className="text-xs text-muted-foreground">静态代码质量与安全分析</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={value.enabled as boolean}
                  onChange={(e) => setValue({ enabled: e.target.checked })}
                />
                <div className="w-9 h-5 rounded-full bg-border peer-checked:bg-foreground/80 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label>Base URL</Label>
              <Input
                value={(value.baseUrl as string) || ''}
                onChange={(e) => setValue({ baseUrl: e.target.value })}
                placeholder="https://sonarqube.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>访问令牌</Label>
              <Input
                type="password"
                value={(value.token as string) || ''}
                onChange={(e) => setValue({ token: e.target.value })}
              />
            </div>
          </div>
        )}
      </ConfigSection>
    </div>
  )
}

function AccountSecurity() {
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string; setupToken: string } | null>(null)
  const [setupCode, setSetupCode] = useState('')
  const [setupError, setSetupError] = useState('')
  const [settingUp, setSettingUp] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [disableError, setDisableError] = useState('')
  const [disabling, setDisabling] = useState(false)
  const [showDisable, setShowDisable] = useState(false)

  useEffect(() => {
    loadMfaStatus()
  }, [])

  const loadMfaStatus = async () => {
    try {
      const res = await api.get('/auth/mfa/status') as { mfaEnabled: boolean }
      setMfaEnabled(res.mfaEnabled)
      const user = getUser()
      if (user) {
        setUser({ ...user, mfaEnabled: res.mfaEnabled })
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const handleStartSetup = async () => {
    setSetupError('')
    setSettingUp(true)
    try {
      const res = await api.get('/auth/mfa/setup') as any
      if (res.alreadyEnabled) {
        setMfaEnabled(true)
        return
      }
      setSetupData(res)
    } catch (err: any) {
      setSetupError(err?.error || '获取配置失败')
    } finally {
      setSettingUp(false)
    }
  }

  const handleEnableMfa = async () => {
    if (!setupData || setupCode.length !== 6) return
    setSetupError('')
    setSettingUp(true)
    try {
      const res = await api.post('/auth/mfa/enable', { code: setupCode }, {
        headers: { Authorization: `Bearer ${setupData.setupToken}` }
      }) as any
      if (res.success) {
        setMfaEnabled(true)
        setSetupData(null)
        setSetupCode('')
        const user = getUser()
        if (user) setUser({ ...user, mfaEnabled: true })
      }
    } catch (err: any) {
      setSetupError(err?.error || '验证失败')
    } finally {
      setSettingUp(false)
    }
  }

  const handleDisableMfa = async () => {
    if (!disablePassword || disableCode.length !== 6) return
    setDisableError('')
    setDisabling(true)
    try {
      const res = await api.post('/auth/mfa/disable', { password: disablePassword, code: disableCode }) as any
      if (res.success) {
        setMfaEnabled(false)
        setShowDisable(false)
        setDisablePassword('')
        setDisableCode('')
        const user = getUser()
        if (user) setUser({ ...user, mfaEnabled: false })
      }
    } catch (err: any) {
      setDisableError(err?.error || '禁用失败')
    } finally {
      setDisabling(false)
    }
  }

  const handleCancelSetup = () => {
    setSetupData(null)
    setSetupCode('')
    setSetupError('')
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                两步验证 (MFA)
              </CardTitle>
              <CardDescription>
                使用身份验证器 App 增强账户安全
              </CardDescription>
            </div>
            <Badge variant={mfaEnabled ? 'success' : 'warning'} className="text-xs">
              {mfaEnabled ? '已启用' : '未启用'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {mfaEnabled ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                两步验证已启用。登录时需要输入身份验证器中的 6 位验证码。
              </p>
              {!showDisable ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowDisable(true)}
                >
                  禁用两步验证
                </Button>
              ) : (
                <div className="space-y-4 pt-2 border-t border-border/50">
                  <div className="space-y-2">
                    <Label>当前密码</Label>
                    <Input
                      type="password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      placeholder="请输入密码确认身份"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>验证码</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6 位验证码"
                      className="text-center tracking-widest font-mono"
                    />
                  </div>
                  {disableError && (
                    <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                      {disableError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleDisableMfa}
                      disabled={disabling || !disablePassword || disableCode.length !== 6}
                    >
                      {disabling ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          处理中...
                        </>
                      ) : '确认禁用'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowDisable(false)
                        setDisablePassword('')
                        setDisableCode('')
                        setDisableError('')
                      }}
                      disabled={disabling}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : setupData ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 p-3 bg-accent/50 rounded-lg">
                  <img
                    src={setupData.qrCodeUrl}
                    alt="MFA QR Code"
                    className="w-32 h-32"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">使用身份验证器扫描二维码</p>
                  <p className="text-xs text-muted-foreground">
                    打开 Google Authenticator、Authy 或其他支持 TOTP 的验证器 App，扫描二维码添加账户。
                  </p>
                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground mb-1">无法扫描？手动输入密钥：</p>
                    <code className="text-xs font-mono bg-accent/50 px-2 py-1 rounded">
                      {setupData.secret}
                    </code>
                  </div>
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t border-border/50">
                <Label>输入 6 位验证码确认启用</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="text-center text-lg tracking-widest font-mono"
                  autoFocus
                />
              </div>
              {setupError && (
                <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  {setupError}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleEnableMfa}
                  disabled={settingUp || setupCode.length !== 6}
                >
                  {settingUp ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      验证中...
                    </>
                  ) : '启用两步验证'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelSetup}
                  disabled={settingUp}
                >
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                启用两步验证后，每次登录都需要输入密码和手机验证器中的动态验证码，大幅提升账户安全性。
              </p>
              <Button
                size="sm"
                onClick={handleStartSetup}
                disabled={settingUp}
              >
                {settingUp ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    生成配置...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-3.5 w-3.5" />
                    启用两步验证
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function Settings() {
  const { data: configs, isLoading } = useConfigs()
  const [activeTab, setActiveTab] = useState<string>('GENERAL')

  const filteredConfigs = configs?.filter((c) => c.category === activeTab) || []

  return (
    <PageContainer
      title="系统设置"
      description="管理平台配置、安全策略、通知渠道和第三方集成"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="GENERAL" className="gap-2">
            <SettingsIcon className="h-4 w-4" />
            基础设置
          </TabsTrigger>
          <TabsTrigger value="SECURITY" className="gap-2">
            <ShieldAlert className="h-4 w-4" />
            安全策略
          </TabsTrigger>
          <TabsTrigger value="NOTIFICATION" className="gap-2">
            <Bell className="h-4 w-4" />
            通知配置
          </TabsTrigger>
          <TabsTrigger value="INTEGRATION" className="gap-2">
            <Plug className="h-4 w-4" />
            集成管理
          </TabsTrigger>
          <TabsTrigger value="ACCOUNT" className="gap-2">
            <User className="h-4 w-4" />
            账户安全
          </TabsTrigger>
        </TabsList>

        {activeTab !== 'ACCOUNT' && isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <TabsContent value="GENERAL">
              <GeneralSettings configs={filteredConfigs} />
            </TabsContent>
            <TabsContent value="SECURITY">
              <SecuritySettings configs={filteredConfigs} />
            </TabsContent>
            <TabsContent value="NOTIFICATION">
              <NotificationSettings configs={filteredConfigs} />
            </TabsContent>
            <TabsContent value="INTEGRATION">
              <IntegrationSettings configs={filteredConfigs} />
            </TabsContent>
            <TabsContent value="ACCOUNT">
              <AccountSecurity />
            </TabsContent>
          </>
        )}
      </Tabs>
    </PageContainer>
  )
}
