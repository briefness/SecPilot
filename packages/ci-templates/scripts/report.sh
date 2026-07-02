#!/usr/bin/env bash
# =============================================================================
# report.sh - 安全扫描结果上报脚本
# =============================================================================
# 版本: 1.0.0
# 描述: 将各类安全扫描工具的结果上报到安全合规平台和 DefectDojo
# 支持工具: OSV, SonarQube, ZAP, Nuclei, MobSF, Playwright
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="${1:-security-reports}"
PRODUCT_ID="${SECURITY_PRODUCT_ID:-}"
API_TOKEN="${SECURITY_API_TOKEN:-}"
PLATFORM_URL="${SECURITY_PLATFORM_URL:-https://secops.example.com/api/v1}"
DEFECTDOJO_URL="${DEFECTDOJO_URL:-https://defectdojo.example.com}"
DEFECTDOJO_API_KEY="${DEFECTDOJO_API_KEY:-}"
PIPELINE_ID="${CI_PIPELINE_ID:-${GITHUB_RUN_ID:-local}}"
COMMIT_HASH="${CI_COMMIT_SHA:-${GITHUB_SHA:-unknown}}"
BRANCH="${CI_COMMIT_BRANCH:-${GITHUB_REF_NAME:-unknown}}"
TAG="${CI_COMMIT_TAG:-}"
TRIGGERED_BY="${GITLAB_CI:+gitlab-ci}${GITHUB_ACTIONS:+github-actions}"
TRIGGERED_BY="${TRIGGERED_BY:-manual}"

usage() {
    cat <<EOF
用法: $0 [报告目录]

环境变量:
  SECURITY_PRODUCT_ID    安全产品唯一标识 (必填)
  SECURITY_API_TOKEN     安全平台 API Token
  SECURITY_PLATFORM_URL  安全平台地址
  DEFECTDOJO_URL         DefectDojo 地址
  DEFECTDOJO_API_KEY     DefectDojo API Key
  CI_PIPELINE_ID         流水线 ID (CI 环境自动注入)
  CI_COMMIT_SHA          提交哈希 (CI 环境自动注入)
  CI_COMMIT_BRANCH       分支名 (CI 环境自动注入)

支持的扫描结果文件:
  - osv-results.json          (OSV Scanner SCA)
  - sonarqube-report.json     (SonarQube SAST)
  - zap/zap-results.json      (OWASP ZAP DAST)
  - nuclei-results.json       (Nuclei 漏洞扫描)
  - mobsf-results.json        (MobSF 移动安全)
  - playwright-results.json   (Playwright E2E)
EOF
    exit 1
}

validate_env() {
    log_info "环境变量校验..."
    
    if [ -z "$PRODUCT_ID" ]; then
        log_error "SECURITY_PRODUCT_ID 未设置"
        return 1
    fi
    
    log_info "产品ID: $PRODUCT_ID"
    log_info "流水线ID: $PIPELINE_ID"
    log_info "提交哈希: $COMMIT_HASH"
    log_info "分支: $BRANCH"
    
    if [ -z "$API_TOKEN" ]; then
        log_warn "SECURITY_API_TOKEN 未设置，将跳过平台上报"
    fi
    
    return 0
}

detect_scan_types() {
    local scan_types=()
    
    log_info "检测扫描结果文件..."
    
    if [ -f "$REPORT_DIR/osv-results.json" ]; then
        scan_types+=("osv")
        log_success "  找到 OSV SCA 扫描结果"
    fi
    
    if [ -f "$REPORT_DIR/sonarqube-report.json" ]; then
        scan_types+=("sonarqube")
        log_success "  找到 SonarQube SAST 扫描结果"
    fi
    
    if [ -f "$REPORT_DIR/zap/zap-results.json" ]; then
        scan_types+=("zap")
        log_success "  找到 OWASP ZAP DAST 扫描结果"
    fi
    
    if [ -f "$REPORT_DIR/nuclei-results.json" ]; then
        scan_types+=("nuclei")
        log_success "  找到 Nuclei 漏洞扫描结果"
    fi
    
    if [ -f "$REPORT_DIR/mobsf-results.json" ]; then
        scan_types+=("mobsf")
        log_success "  找到 MobSF 移动安全扫描结果"
    fi
    
    if [ -f "$REPORT_DIR/playwright-results.json" ]; then
        scan_types+=("playwright")
        log_success "  找到 Playwright E2E 测试结果"
    fi
    
    if [ ${#scan_types[@]} -eq 0 ]; then
        log_warn "未找到任何扫描结果文件"
        return 1
    fi
    
    SCAN_TYPES="${scan_types[*]}"
    log_info "检测到扫描类型: $SCAN_TYPES"
    return 0
}

parse_finding_summary() {
    local file="$1"
    local scanner="$2"
    
    local critical=0
    local high=0
    local medium=0
    local low=0
    local info=0
    
    case "$scanner" in
        osv)
            if [ -f "$file" ]; then
                critical=$(grep -ci '"severity": "CRITICAL"' "$file" 2>/dev/null || echo 0)
                high=$(grep -ci '"severity": "HIGH"' "$file" 2>/dev/null || echo 0)
                medium=$(grep -ci '"severity": "MEDIUM"' "$file" 2>/dev/null || echo 0)
                low=$(grep -ci '"severity": "LOW"' "$file" 2>/dev/null || echo 0)
            fi
            ;;
        nuclei)
            if [ -f "$file" ]; then
                critical=$(grep -c '"severity":"critical"' "$file" 2>/dev/null || echo 0)
                high=$(grep -c '"severity":"high"' "$file" 2>/dev/null || echo 0)
                medium=$(grep -c '"severity":"medium"' "$file" 2>/dev/null || echo 0)
                low=$(grep -c '"severity":"low"' "$file" 2>/dev/null || echo 0)
                info=$(grep -c '"severity":"info"' "$file" 2>/dev/null || echo 0)
            fi
            ;;
        zap)
            if [ -f "$file" ]; then
                critical=$(grep -c '"riskcode":"3"' "$file" 2>/dev/null || echo 0)
                high=$(grep -c '"riskcode":"2"' "$file" 2>/dev/null || echo 0)
                medium=$(grep -c '"riskcode":"1"' "$file" 2>/dev/null || echo 0)
                low=$(grep -c '"riskcode":"0"' "$file" 2>/dev/null || echo 0)
            fi
            ;;
        *)
            log_warn "未知扫描器类型: $scanner"
            ;;
    esac
    
    cat <<EOF
{
  "scanner": "$scanner",
  "critical": $critical,
  "high": $high,
  "medium": $medium,
  "low": $low,
  "info": $info
}
EOF
}

report_to_platform() {
    if [ -z "$API_TOKEN" ]; then
        log_warn "跳过安全平台上报 (缺少 API Token)"
        return 0
    fi
    
    log_info "上报到安全平台: $PLATFORM_URL"
    
    local summary_array="[]"
    local summaries=()
    
    for scanner in $SCAN_TYPES; do
        local file=""
        case "$scanner" in
            osv)        file="$REPORT_DIR/osv-results.json" ;;
            sonarqube)  file="$REPORT_DIR/sonarqube-report.json" ;;
            zap)        file="$REPORT_DIR/zap/zap-results.json" ;;
            nuclei)     file="$REPORT_DIR/nuclei-results.json" ;;
            mobsf)      file="$REPORT_DIR/mobsf-results.json" ;;
            playwright) file="$REPORT_DIR/playwright-results.json" ;;
        esac
        
        if [ -n "$file" ] && [ -f "$file" ]; then
            local summary
            summary=$(parse_finding_summary "$file" "$scanner")
            summaries+=("$summary")
        fi
    done
    
    if [ ${#summaries[@]} -gt 0 ]; then
        summary_array=$(printf "%s," "${summaries[@]}")
        summary_array="[${summary_array%,}]"
    fi
    
    local payload
    payload=$(cat <<EOF
{
  "productId": "$PRODUCT_ID",
  "pipelineId": "$PIPELINE_ID",
  "commitHash": "$COMMIT_HASH",
  "branch": "$BRANCH",
  "tag": "$TAG",
  "scanTypes": "$SCAN_TYPES",
  "triggeredBy": "$TRIGGERED_BY",
  "reportDir": "$REPORT_DIR",
  "scanSummaries": $summary_array,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)
    
    local response
    response=$(curl -s -w "\n%{http_code}" -X POST "$PLATFORM_URL/scans/ingest" \
        -H "Authorization: Bearer $API_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null) || true
    
    local http_code
    http_code=$(echo "$response" | tail -n1)
    local body
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        log_success "安全平台上报成功 (HTTP $http_code)"
        return 0
    else
        log_error "安全平台上报失败 (HTTP $http_code)"
        log_error "响应: $body"
        return 1
    fi
}

report_to_defectdojo() {
    if [ -z "$DEFECTDOJO_API_KEY" ]; then
        log_warn "跳过 DefectDojo 上报 (缺少 API Key)"
        return 0
    fi
    
    log_info "上报到 DefectDojo: $DEFECTDOJO_URL"
    
    local engagement_id=""
    
    for scanner in $SCAN_TYPES; do
        local file=""
        local scan_type=""
        
        case "$scanner" in
            osv)
                file="$REPORT_DIR/osv-results.json"
                scan_type="OSV Scanner"
                ;;
            sonarqube)
                file="$REPORT_DIR/sonarqube-report.json"
                scan_type="SonarQube Scan"
                ;;
            zap)
                file="$REPORT_DIR/zap/zap-results.json"
                scan_type="ZAP Scan"
                ;;
            nuclei)
                file="$REPORT_DIR/nuclei-results.json"
                scan_type="Nuclei"
                ;;
            mobsf)
                file="$REPORT_DIR/mobsf-results.json"
                scan_type="MobSF"
                ;;
        esac
        
        if [ -z "$file" ] || [ ! -f "$file" ]; then
            continue
        fi
        
        log_info "  上传 $scanner 结果..."
        
        curl -s -X POST "$DEFECTDOJO_URL/api/v2/import-scan/" \
            -H "Authorization: Token $DEFECTDOJO_API_KEY" \
            -F "scan_type=$scan_type" \
            -F "file=@$file" \
            -F "engagement=$engagement_id" \
            -F "product_name=$PRODUCT_ID" \
            -F "active=true" \
            -F "verified=false" || log_warn "  $scanner 上传失败"
    done
    
    log_success "DefectDojo 上报完成"
    return 0
}

generate_summary() {
    log_info "生成扫描汇总报告..."
    
    local summary_file="$REPORT_DIR/SUMMARY.md"
    
    cat > "$summary_file" <<EOF
# 安全扫描汇总报告

## 基本信息

| 项目 | 值 |
|------|-----|
| 产品ID | $PRODUCT_ID |
| 流水线ID | $PIPELINE_ID |
| 提交哈希 | $COMMIT_HASH |
| 分支 | $BRANCH |
| 触发方式 | $TRIGGERED_BY |
| 生成时间 | $(date -u +%Y-%m-%dT%H:%M:%SZ) |

## 扫描类型

$SCAN_TYPES

## 漏洞统计

| 扫描器 | 严重 | 高危 | 中危 | 低危 | 信息 |
|--------|------|------|------|------|------|
EOF
    
    for scanner in $SCAN_TYPES; do
        local file=""
        case "$scanner" in
            osv)        file="$REPORT_DIR/osv-results.json" ;;
            sonarqube)  file="$REPORT_DIR/sonarqube-report.json" ;;
            zap)        file="$REPORT_DIR/zap/zap-results.json" ;;
            nuclei)     file="$REPORT_DIR/nuclei-results.json" ;;
            mobsf)      file="$REPORT_DIR/mobsf-results.json" ;;
            playwright) file="$REPORT_DIR/playwright-results.json" ;;
        esac
        
        if [ -n "$file" ] && [ -f "$file" ]; then
            local summary
            summary=$(parse_finding_summary "$file" "$scanner")
            local c h m l i
            c=$(echo "$summary" | grep -o '"critical": [0-9]*' | grep -o '[0-9]*')
            h=$(echo "$summary" | grep -o '"high": [0-9]*' | grep -o '[0-9]*')
            m=$(echo "$summary" | grep -o '"medium": [0-9]*' | grep -o '[0-9]*')
            l=$(echo "$summary" | grep -o '"low": [0-9]*' | grep -o '[0-9]*')
            i=$(echo "$summary" | grep -o '"info": [0-9]*' | grep -o '[0-9]*')
            echo "| $scanner | ${c:-0} | ${h:-0} | ${m:-0} | ${l:-0} | ${i:-0} |" >> "$summary_file"
        fi
    done
    
    cat >> "$summary_file" <<EOF

## 报告文件

EOF
    
    find "$REPORT_DIR" -type f | sort | while read -r f; do
        local size
        size=$(du -h "$f" | cut -f1)
        echo "- \`$(basename "$f")\` ($size)" >> "$summary_file"
    done
    
    log_success "汇总报告已生成: $summary_file"
}

main() {
    log_info "=========================================="
    log_info "  安全扫描结果上报工具 v1.0.0"
    log_info "=========================================="
    echo ""
    
    if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
        usage
    fi
    
    if [ ! -d "$REPORT_DIR" ]; then
        log_error "报告目录不存在: $REPORT_DIR"
        exit 1
    fi
    
    validate_env || exit 1
    echo ""
    
    detect_scan_types || {
        log_warn "没有检测到扫描结果，退出"
        exit 0
    }
    echo ""
    
    report_to_platform || true
    echo ""
    
    report_to_defectdojo || true
    echo ""
    
    generate_summary
    echo ""
    
    log_success "所有上报任务完成"
}

main "$@"
