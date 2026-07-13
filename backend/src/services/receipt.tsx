import path from "node:path";
import QRCode from "qrcode";
import {
  Document,
  Page,
  Text,
  View,
  Svg,
  Rect,
  Defs,
  LinearGradient,
  Stop,
  Image,
  Link,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");
const PAGE_WIDTH = 595.28; // A4 width in points

let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(FONT_DIR, "Inter-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(FONT_DIR, "Inter-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(FONT_DIR, "Inter-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  Font.register({
    family: "Space Grotesk",
    fonts: [
      { src: path.join(FONT_DIR, "SpaceGrotesk-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(FONT_DIR, "SpaceGrotesk-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  fontsRegistered = true;
}

// Brand palette — mirrors frontend/src/styles.css's @theme values.
const COLORS = {
  orange: "#F97316",
  orangeDeep: "#EA580C",
  navy: "#0B0F1A",
  navySurface: "#1C2338",
  success: "#22C55E",
  successBg: "#DCFCE7",
  danger: "#EF4444",
  dangerBg: "#FEE2E2",
  warning: "#F59E0B",
  warningBg: "#FEF3C7",
  muted: "#6B7280",
  border: "#E5E7EB",
  bg: "#F9FAFB",
};

export type ReceiptTransactionData = {
  reference: string;
  status: "settled" | "failed" | "expired" | "requires_review";
  direction: "in" | "out";
  counterparty: string;
  amountUsdc: number;
  amountLocal: number | null;
  localCurrency: string | null;
  fxRate: number | null;
  feeUsdc: number;
  token: string;
  railLabel: string;
  txHash: string | null;
  txExplorerUrl: string | null;
  railReference: string | null;
  note: string | null;
  merchantBusinessName: string | null;
  merchantTillNumber: string | null;
  merchantPaybillNumber: string | null;
  merchantAccountNumber: string | null;
  failureReason: string | null;
  refundTxHash: string | null;
  refundedAt: string | null;
  createdAt: string;
  settledAt: string | null;
  trackUrl: string;
};

const STATUS_COPY: Record<ReceiptTransactionData["status"], { label: string; color: string; bg: string }> = {
  settled: { label: "Settled", color: COLORS.success, bg: COLORS.successBg },
  failed: { label: "Failed", color: COLORS.danger, bg: COLORS.dangerBg },
  expired: { label: "Expired", color: COLORS.danger, bg: COLORS.dangerBg },
  requires_review: { label: "Under review", color: COLORS.warning, bg: COLORS.warningBg },
};

function fmtAmount(n: number, maxFractionDigits = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: maxFractionDigits });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateMiddle(s: string, head = 10, tail = 8): string {
  return s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
}

const styles = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9, color: COLORS.navy, paddingBottom: 40 },
  headerWrap: { height: 84, position: "relative" },
  headerRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  logoMarkText: { fontFamily: "Space Grotesk", fontWeight: "bold", fontSize: 14, color: COLORS.orangeDeep },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandText: { fontFamily: "Space Grotesk", fontWeight: "bold", fontSize: 17, color: "#FFFFFF" },
  headerRight: { alignItems: "flex-end" },
  headerRightLabel: { fontSize: 8, letterSpacing: 1.5, color: "rgba(255,255,255,0.8)", textTransform: "uppercase" },
  headerRightRef: { fontFamily: "Inter", fontWeight: 600, fontSize: 11, color: "#FFFFFF", marginTop: 2 },

  body: { paddingHorizontal: 36, paddingTop: 24 },

  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontSize: 8,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 },
  heroAmount: { fontFamily: "Space Grotesk", fontWeight: "bold", fontSize: 30 },
  heroLocal: { fontSize: 9, color: COLORS.muted, marginTop: 3 },
  heroRight: { alignItems: "flex-end" },
  heroDirection: { fontSize: 8, letterSpacing: 1, color: COLORS.muted, textTransform: "uppercase" },
  heroCounterparty: { fontFamily: "Inter", fontWeight: 600, fontSize: 12, marginTop: 3 },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 18 },

  alertBox: { borderRadius: 8, padding: 10, marginBottom: 16 },
  alertText: { fontSize: 9, lineHeight: 1.4 },

  table: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 8, letterSpacing: 0.6, textTransform: "uppercase", color: COLORS.muted },
  rowValue: { fontSize: 9.5, fontWeight: 600, maxWidth: 300, textAlign: "right" },
  rowValueMono: { fontFamily: "Inter", fontSize: 9, fontWeight: 600 },
  rowValueLink: { fontSize: 9, fontWeight: 600, color: COLORS.orangeDeep, textDecoration: "none" },

  footerWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerQr: { width: 46, height: 46 },
  footerTextWrap: { marginLeft: 12, flex: 1 },
  footerLine: { fontSize: 7.5, color: COLORS.muted, lineHeight: 1.5 },
  footerBrandLine: { fontSize: 7.5, color: COLORS.muted, lineHeight: 1.5, fontWeight: 600 },
});

function Row({ label, value, mono, link, last }: { label: string; value: string; mono?: boolean; link?: string; last?: boolean }) {
  return (
    <View style={last ? [styles.row, styles.rowLast] : styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {link ? (
        <Link src={link} style={styles.rowValueLink}>{value}</Link>
      ) : (
        <Text style={mono ? styles.rowValueMono : styles.rowValue}>{value}</Text>
      )}
    </View>
  );
}

async function buildQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 0, width: 200, color: { dark: COLORS.navy, light: "#FFFFFF00" } });
}

export async function generateReceiptPdf(data: ReceiptTransactionData): Promise<Buffer> {
  registerFonts();

  const qrDataUrl = await buildQrDataUrl(data.trackUrl);
  const statusCopy = STATUS_COPY[data.status];
  const isRefunded = !!data.refundTxHash;
  const directionLabel = data.direction === "out" ? "You sent" : "You received";
  const localLine =
    data.amountLocal != null && data.localCurrency
      ? `${data.localCurrency} ${fmtAmount(data.amountLocal)}`
      : null;
  const rows: { label: string; value: string; mono?: boolean; link?: string }[] = [
    { label: "Date & time", value: fmtDateTime(data.createdAt) },
    { label: "Payment method", value: data.railLabel },
  ];
  if (data.merchantBusinessName) {
    rows.push({ label: "Merchant", value: data.merchantBusinessName });
  }
  if (data.merchantTillNumber) rows.push({ label: "Till number", value: data.merchantTillNumber, mono: true });
  if (data.merchantPaybillNumber) rows.push({ label: "PayBill number", value: data.merchantPaybillNumber, mono: true });
  if (data.merchantAccountNumber) rows.push({ label: "Account number", value: data.merchantAccountNumber, mono: true });
  if (data.fxRate) rows.push({ label: "FX rate", value: `1 ${data.token} = ${data.fxRate.toFixed(2)} ${data.localCurrency}` });
  rows.push({ label: "Fee", value: `${fmtAmount(data.feeUsdc)} ${data.token}` });
  rows.push({ label: "Reference", value: data.reference, mono: true });
  if (data.railReference) rows.push({ label: "Rail reference", value: data.railReference, mono: true });
  if (data.txHash) {
    rows.push({
      label: "Blockchain transaction",
      value: truncateMiddle(data.txHash),
      mono: true,
      link: data.txExplorerUrl ?? undefined,
    });
  }
  if (data.settledAt) rows.push({ label: "Settled at", value: fmtDateTime(data.settledAt) });
  if (isRefunded) rows.push({ label: "Refund", value: "Stablecoin returned to your balance" });
  if (data.note) rows.push({ label: "Note", value: data.note });

  return renderToBuffer(
    <Document
      title={`AutoPayKe Receipt ${data.reference}`}
      author="AutoPayKe"
      creator="AutoPayKe"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerWrap}>
          <Svg style={{ position: "absolute", top: 0, left: 0 }} width={PAGE_WIDTH} height={84}>
            <Defs>
              <LinearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={COLORS.orange} />
                <Stop offset="1" stopColor={COLORS.orangeDeep} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={PAGE_WIDTH} height={84} fill="url(#headerGrad)" />
          </Svg>
          <View style={styles.headerRow}>
            <View style={styles.brandRow}>
              <View style={styles.logoMark}>
                <Text style={styles.logoMarkText}>A</Text>
              </View>
              <Text style={styles.brandText}>AutoPayKe</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.headerRightLabel}>Payment Receipt</Text>
              <Text style={styles.headerRightRef}>{data.reference}</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={[styles.statusPill, { backgroundColor: statusCopy.bg }]}>
            <Text style={{ color: statusCopy.color }}>{statusCopy.label}</Text>
          </View>

          <View style={styles.heroRow}>
            <View>
              <Text style={styles.heroAmount}>{data.token} {fmtAmount(data.amountUsdc)}</Text>
              {localLine && <Text style={styles.heroLocal}>≈ {localLine}</Text>}
            </View>
            <View style={styles.heroRight}>
              <Text style={styles.heroDirection}>{directionLabel}</Text>
              <Text style={styles.heroCounterparty}>{data.counterparty}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {data.status === "requires_review" && (
            <View style={[styles.alertBox, { backgroundColor: COLORS.warningBg }]}>
              <Text style={[styles.alertText, { color: "#92400E" }]}>
                This transfer is currently under manual review by AutoPayKe operations.
                {data.failureReason ? ` ${data.failureReason}` : ""}
              </Text>
            </View>
          )}
          {(data.status === "failed" || data.status === "expired") && (
            <View style={[styles.alertBox, { backgroundColor: COLORS.dangerBg }]}>
              <Text style={[styles.alertText, { color: "#991B1B" }]}>
                {data.status === "expired" ? "This transfer expired before it could settle." : "This transfer failed to settle."}
                {data.failureReason ? ` ${data.failureReason}` : ""}
                {isRefunded ? " Your stablecoin balance has been refunded." : ""}
              </Text>
            </View>
          )}

          <View style={styles.table}>
            {rows.map((r, i) => (
              <Row key={r.label} {...r} last={i === rows.length - 1} />
            ))}
          </View>
        </View>

        <View style={styles.footerWrap}>
          <Image src={qrDataUrl} style={styles.footerQr} />
          <View style={styles.footerTextWrap}>
            <Text style={styles.footerBrandLine}>AutoPayKe · www.autopayke.com</Text>
            <Text style={styles.footerLine}>Support: autopayke@gmail.com</Text>
            <Text style={styles.footerLine}>
              {`This is an electronically generated receipt and does not require a signature. Generated ${fmtDateTime(new Date().toISOString())}.`}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
