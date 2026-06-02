import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer'
import React from 'react'

const BLUE = '#2563EB'

// Complete Noto Sans TTFs via @expo-google-fonts (jsDelivr CDN).
// Each file is the FULL font (~556KB, verified magic 00 01 00 00) with complete
// Turkish glyph coverage (İ Ğ ğ Ş ş Ç ç Ü ü Ö ö ı). One file per weight —
// avoids the subset-merge problem: @react-pdf/renderer uses one file per weight
// and does NOT combine split latin / latin-ext subsets.
const CDN = 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans@0.2.3'
Font.register({
  family: 'NotoSans',
  fonts: [
    { src: `${CDN}/NotoSans_400Regular.ttf` },
    { src: `${CDN}/NotoSans_700Bold.ttf`, fontWeight: 'bold' },
  ],
})

const styles = StyleSheet.create({
  page: { fontFamily: 'NotoSans', fontSize: 10, color: '#111827', padding: 40 },
  header: { backgroundColor: BLUE, padding: '16 24', marginBottom: 20, borderRadius: 4 },
  headerTitle: { color: 'white', fontSize: 18, fontFamily: 'NotoSans', fontWeight: 'bold' as const },
  headerSub: { color: '#BFDBFE', fontSize: 10, marginTop: 4 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontFamily: 'NotoSans', fontWeight: 'bold' as const, color: '#1F2937', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 4, marginBottom: 8 },
  infoTable: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 4, marginBottom: 16 },
  infoRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', padding: '6 10' },
  infoLabel: { width: 140, color: '#6B7280', fontSize: 9 },
  infoValue: { flex: 1, color: '#111827' },
  summaryBox: { backgroundColor: '#F0F9FF', borderLeftWidth: 3, borderLeftColor: BLUE, padding: '8 12', marginBottom: 16, borderRadius: 2 },
  summaryText: { color: '#1E40AF', fontSize: 10, lineHeight: 1.5 },
  techTable: { marginBottom: 16 },
  techRow: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  techLabel: { flex: 1, fontSize: 9 },
  techGrade: { width: 30, fontSize: 9, fontFamily: 'NotoSans', fontWeight: 'bold' as const, textAlign: 'center' },
  techScore: { width: 50, fontSize: 9, color: '#6B7280', textAlign: 'right' },
  issueCard: { marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  issueHeader: { flexDirection: 'row', alignItems: 'center', padding: '6 10', gap: 8 },
  issueBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, fontSize: 8, fontFamily: 'NotoSans', fontWeight: 'bold' as const },
  issueTitle: { flex: 1, fontSize: 10, fontFamily: 'NotoSans', fontWeight: 'bold' as const, color: '#111827' },
  issueBody: { padding: '6 10', backgroundColor: '#FAFAFA' },
  issueDesc: { fontSize: 9, color: '#4B5563', marginBottom: 4, lineHeight: 1.4 },
  issueImpact: { fontSize: 9, color: '#78350F', backgroundColor: '#FFFBEB', padding: '4 6', borderRadius: 2, marginBottom: 4, lineHeight: 1.4 },
  deployBox: { fontSize: 9, color: '#1E3A8A', backgroundColor: '#EFF6FF', padding: '6 8', borderRadius: 2, marginTop: 4, lineHeight: 1.4 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#9CA3AF' },
  statsTable: { marginBottom: 16 },
  statsRow: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  statsLabel: { flex: 1, fontSize: 9, color: '#6B7280' },
  statsValue: { fontSize: 9, fontFamily: 'NotoSans', fontWeight: 'bold' as const, textAlign: 'right' },
  techRecommendation: { fontSize: 8, color: '#6B7280', marginLeft: 8, marginBottom: 4, lineHeight: 1.4 },
  findingRow: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 6, alignItems: 'flex-start' },
  findingTitle: { flex: 1, fontSize: 9, color: '#111827' },
  findingStatus: { fontSize: 8, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, fontFamily: 'NotoSans', fontWeight: 'bold' as const },
  findingDesc: { fontSize: 8, color: '#6B7280', marginTop: 2 },
  codeBox: { fontSize: 8, color: '#1E3A8A', backgroundColor: '#F8FAFC', padding: '6 8', borderRadius: 2, fontFamily: 'Courier', lineHeight: 1.4 },
  compRow: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  compLabel: { flex: 2, fontSize: 9, color: '#6B7280' },
  compPrev: { flex: 1, fontSize: 9, textAlign: 'right' },
  compCurr: { flex: 1, fontSize: 9, fontFamily: 'NotoSans', fontWeight: 'bold' as const, textAlign: 'right' },
  compChange: { flex: 1, fontSize: 9, textAlign: 'right' },
})

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: '#FEE2E2', text: '#991B1B' },
  HIGH:     { bg: '#FFEDD5', text: '#9A3412' },
  MEDIUM:   { bg: '#FEF9C3', text: '#854D0E' },
  LOW:      { bg: '#F3F4F6', text: '#374151' },
}

const SEVERITY_TR: Record<string, string> = {
  CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük',
}

const GRADE_COLOR: Record<string, string> = {
  A: '#15803D', B: '#16A34A', C: '#CA8A04', D: '#EA580C', F: '#DC2626',
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING:   { bg: '#FEF9C3', text: '#854D0E' },
  APPLIED:   { bg: '#DCFCE7', text: '#166534' },
  DISMISSED: { bg: '#F3F4F6', text: '#374151' },
}

const STATUS_TR: Record<string, string> = {
  PENDING: 'Bekliyor', APPLIED: 'Uygulandı', DISMISSED: 'Reddedildi',
}

// ─── Shared sub-components ──────────────────────────────────────────────────

function TechScoresSection({ techScores }: { techScores: ActionPlanPdfProps['techScores'] }) {
  if (!techScores || techScores.length === 0) return null
  const withRecs = techScores.filter(s => s.recommendation && !s.unknown)
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Teknik Durum</Text>
      <View style={styles.techTable}>
        {techScores.map((s, i) => (
          <View key={i} style={styles.techRow}>
            <Text style={styles.techLabel}>{s.label}</Text>
            {s.unknown ? (
              <>
                <Text style={[styles.techGrade, { color: '#9CA3AF' }]}>—</Text>
                <Text style={styles.techScore}>Bilinmiyor</Text>
              </>
            ) : (
              <>
                <Text style={[styles.techGrade, { color: GRADE_COLOR[s.grade] ?? '#374151' }]}>{s.grade}</Text>
                <Text style={styles.techScore}>{s.score}/100</Text>
              </>
            )}
          </View>
        ))}
      </View>
      {withRecs.length > 0 && (
        <View>
          {withRecs.map((s, i) => (
            <Text key={i} style={styles.techRecommendation}>• {s.label}: {s.recommendation}</Text>
          ))}
        </View>
      )}
    </View>
  )
}

function PageFooter({ generatedAt }: { generatedAt: Date }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Obsey tarafından oluşturulmuştur</Text>
      <Text style={styles.footerText}>
        {generatedAt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
        {'  '}
        <Text render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber} / ${totalPages}`} />
      </Text>
    </View>
  )
}

// ─── ActionPlanPdf ──────────────────────────────────────────────────────────

export interface ActionPlanPdfProps {
  siteName: string
  siteUrl: string
  period: string
  generatedAt: Date
  summary: string
  pendingCount: number
  techScores: Array<{ label: string; grade: string; score: number; recommendation?: string; unknown?: boolean }>
  issues: Array<{
    severity: string
    category: string
    title: string
    description: string
    impact: string
    actionType: string
    deployInstructions?: string
  }>
}

export function ActionPlanPdf(props: ActionPlanPdfProps) {
  const { siteName, siteUrl, period, generatedAt, summary, pendingCount, techScores, issues } = props
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>GEO Aksiyon Plan&#305;</Text>
          <Text style={styles.headerSub}>{siteName}</Text>
        </View>

        {/* Info table */}
        <View style={styles.infoTable}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Site URL</Text>
            <Text style={styles.infoValue}>{siteUrl}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>D&#246;nem</Text>
            <Text style={styles.infoValue}>{period}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Olu&#351;turuldu</Text>
            <Text style={styles.infoValue}>{generatedAt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Bekleyen &#304;yile&#351;tirme</Text>
            <Text style={styles.infoValue}>{pendingCount}</Text>
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>{summary}</Text>
        </View>

        {/* Technical Status */}
        <TechScoresSection techScores={techScores} />

        {/* Issues */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bekleyen &#304;yile&#351;tirmeler</Text>
          {issues.length === 0 ? (
            <Text style={{ fontSize: 9, color: '#6B7280' }}>T&#252;m kontroller ge&#231;ti. Aktif sorun yok.</Text>
          ) : (
            issues.map((issue, i) => {
              const sevColor = SEVERITY_COLORS[issue.severity] ?? SEVERITY_COLORS.LOW
              return (
                <View key={i} style={styles.issueCard} wrap={false}>
                  <View style={[styles.issueHeader, { backgroundColor: sevColor.bg }]}>
                    <Text style={[styles.issueBadge, { backgroundColor: sevColor.bg, color: sevColor.text }]}>
                      {SEVERITY_TR[issue.severity] ?? issue.severity}
                    </Text>
                    <Text style={styles.issueTitle}>{issue.title}</Text>
                  </View>
                  <View style={styles.issueBody}>
                    <Text style={styles.issueDesc}>{issue.description}</Text>
                    <Text style={styles.issueImpact}>{issue.impact}</Text>
                    {issue.deployInstructions ? (
                      <Text style={styles.deployBox}>{issue.deployInstructions}</Text>
                    ) : null}
                  </View>
                </View>
              )
            })
          )}
        </View>

        <PageFooter generatedAt={generatedAt} />
      </Page>
    </Document>
  )
}

// ─── ReportPdf ───────────────────────────────────────────────────────────────

export interface ReportPdfProps {
  siteName: string
  siteUrl: string
  period: string
  triggerType: string
  generatedAt: Date
  summary: string
  techScores: Array<{ label: string; grade: string; score: number; recommendation?: string; unknown?: boolean }>
  llmsTxtContent?: string | null
  stats: {
    issuesFound: number
    issuesFixed: number
    issuesPending: number
    aiVisits: number
    llmsTxtUpdated: boolean
  }
  prevStats?: { issuesFound: number; issuesFixed: number } | null
  findings: Array<{
    severity: string
    category: string
    title: string
    description: string
    impact: string
    status: string
    actionType: string
  }>
}

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

export function ReportPdf(props: ReportPdfProps) {
  const { siteName, siteUrl, period, triggerType, generatedAt, summary, techScores, llmsTxtContent, stats, prevStats, findings } = props

  const triggerLabel = triggerType === 'WEEKLY' ? 'Haftalık' : 'Manuel'

  const grouped = SEVERITY_ORDER.reduce<Record<string, typeof findings>>((acc, sev) => {
    acc[sev] = findings.filter(f => f.severity === sev)
    return acc
  }, {})

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>GEO Raporu</Text>
          <Text style={styles.headerSub}>{siteName}</Text>
        </View>

        {/* Info table */}
        <View style={styles.infoTable}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Site URL</Text>
            <Text style={styles.infoValue}>{siteUrl}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>D&#246;nem</Text>
            <Text style={styles.infoValue}>{period}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tetikleyici</Text>
            <Text style={styles.infoValue}>{triggerLabel}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Olu&#351;turuldu</Text>
            <Text style={styles.infoValue}>{generatedAt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>{summary}</Text>
        </View>

        {/* Technical Status */}
        <TechScoresSection techScores={techScores} />

        {/* llms.txt */}
        {llmsTxtContent ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>llms.txt &#304;&#231;eri&#287;i</Text>
            <View style={styles.codeBox}>
              <Text>{llmsTxtContent.trim().slice(0, 600)}{llmsTxtContent.trim().length > 600 ? '...' : ''}</Text>
            </View>
          </View>
        ) : null}

        {/* Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>&#304;statistikler</Text>
          <View style={styles.statsTable}>
            {[
              ['Bulunan Sorun', String(stats.issuesFound)],
              ['Çözülen Sorun', String(stats.issuesFixed)],
              ['Bekleyen Sorun', String(stats.issuesPending)],
              ['AI Ziyaret', String(stats.aiVisits)],
              ['llms.txt Güncellendi', stats.llmsTxtUpdated ? 'Evet' : 'Hayır'],
            ].map(([label, value], i) => (
              <View key={i} style={styles.statsRow}>
                <Text style={styles.statsLabel}>{label}</Text>
                <Text style={styles.statsValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Period comparison */}
        {prevStats ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>D&#246;nem Kar&#351;&#305;la&#351;t&#305;rmas&#305;</Text>
            <View style={styles.statsTable}>
              <View style={styles.compRow}>
                <Text style={[styles.compLabel, { fontFamily: 'NotoSans', fontWeight: 'bold' as const, color: '#374151' }]}>Metrik</Text>
                <Text style={[styles.compPrev, { fontFamily: 'NotoSans', fontWeight: 'bold' as const, color: '#374151' }]}>Önceki</Text>
                <Text style={[styles.compCurr, { color: '#374151' }]}>Mevcut</Text>
                <Text style={[styles.compChange, { fontFamily: 'NotoSans', fontWeight: 'bold' as const, color: '#374151' }]}>Değişim</Text>
              </View>
              {[
                ['Bulunan Sorun', prevStats.issuesFound, stats.issuesFound],
                ['Çözülen Sorun', prevStats.issuesFixed, stats.issuesFixed],
              ].map(([label, prev, curr], i) => {
                const delta = (curr as number) - (prev as number)
                return (
                  <View key={i} style={styles.compRow}>
                    <Text style={styles.compLabel}>{label as string}</Text>
                    <Text style={styles.compPrev}>{String(prev)}</Text>
                    <Text style={styles.compCurr}>{String(curr)}</Text>
                    <Text style={[styles.compChange, { color: delta > 0 ? '#DC2626' : delta < 0 ? '#16A34A' : '#6B7280' }]}>
                      {delta >= 0 ? '+' : ''}{delta}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        ) : null}

        {/* All Findings */}
        {findings.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>T&#252;m Bulgular</Text>
            {SEVERITY_ORDER.map(sev => {
              const group = grouped[sev]
              if (!group || group.length === 0) return null
              const sevColor = SEVERITY_COLORS[sev] ?? SEVERITY_COLORS.LOW
              return (
                <View key={sev}>
                  <Text style={{ fontSize: 10, fontFamily: 'NotoSans', fontWeight: 'bold' as const, color: sevColor.text, marginBottom: 4, marginTop: 6 }}>
                    {SEVERITY_TR[sev] ?? sev}
                  </Text>
                  {group.map((finding, i) => {
                    const stColor = STATUS_COLORS[finding.status] ?? STATUS_COLORS.PENDING
                    return (
                      <View key={i} style={styles.findingRow} wrap={false}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.findingTitle}>{finding.title}</Text>
                          <Text style={styles.findingDesc}>{finding.description}</Text>
                        </View>
                        <Text style={[styles.findingStatus, { backgroundColor: stColor.bg, color: stColor.text }]}>
                          {STATUS_TR[finding.status] ?? finding.status}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              )
            })}
          </View>
        ) : null}

        <PageFooter generatedAt={generatedAt} />
      </Page>
    </Document>
  )
}
