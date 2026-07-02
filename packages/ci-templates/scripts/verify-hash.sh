#!/usr/bin/env bash
# =============================================================================
# verify-hash.sh - SHA-256 哈希校验脚本
# =============================================================================
# 版本: 1.0.0
# 描述: 生成和校验文件/目录的 SHA-256 哈希值，用于发版审计和完整性校验
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_detail() { echo -e "${CYAN}[DETAIL]${NC} $*"; }

MODE="generate"
TARGET=""
OUTPUT_FILE=""
EXPECTED_FILE=""
EXCLUDE_PATTERNS=()
VERBOSE=false
QUIET=false

usage() {
    cat <<EOF
用法: $0 [选项] <目标路径>

选项:
  -m, --mode <模式>       操作模式: generate(生成) | verify(校验) (默认: generate)
  -o, --output <文件>     输出哈希清单文件 (默认: SHA256SUMS)
  -e, --expected <文件>   预期哈希文件 (verify 模式必填)
  -x, --exclude <模式>    排除模式 (可多次指定)
  -v, --verbose           详细输出
  -q, --quiet             静默模式，只输出错误
  -h, --help              显示帮助信息

示例:
  # 生成当前目录的哈希清单
  $0 generate .

  # 生成指定目录的哈希清单，排除 node_modules
  $0 -m generate -o release-hashes.txt -x 'node_modules/*' ./dist

  # 校验哈希
  $0 -m verify -e SHA256SUMS ./dist

  # 校验单个文件
  $0 verify -e expected-hash.txt app-v1.0.0.tar.gz
EOF
    exit 0
}

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            -m|--mode)
                MODE="$2"
                shift 2
                ;;
            -o|--output)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            -e|--expected)
                EXPECTED_FILE="$2"
                shift 2
                ;;
            -x|--exclude)
                EXCLUDE_PATTERNS+=("$2")
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -q|--quiet)
                QUIET=true
                shift
                ;;
            -h|--help)
                usage
                ;;
            generate|verify)
                MODE="$1"
                shift
                ;;
            *)
                TARGET="$1"
                shift
                ;;
        esac
    done
    
    if [ -z "$TARGET" ]; then
        TARGET="."
    fi
}

validate_args() {
    if [ "$MODE" != "generate" ] && [ "$MODE" != "verify" ]; then
        log_error "无效的模式: $MODE (必须是 generate 或 verify)"
        exit 1
    fi
    
    if [ ! -e "$TARGET" ]; then
        log_error "目标路径不存在: $TARGET"
        exit 1
    fi
    
    if [ "$MODE" = "verify" ] && [ -z "$EXPECTED_FILE" ]; then
        log_error "verify 模式必须指定 --expected 参数"
        exit 1
    fi
    
    if [ "$MODE" = "verify" ] && [ ! -f "$EXPECTED_FILE" ]; then
        log_error "预期哈希文件不存在: $EXPECTED_FILE"
        exit 1
    fi
    
    if [ -z "$OUTPUT_FILE" ]; then
        if [ -d "$TARGET" ]; then
            OUTPUT_FILE="$TARGET/SHA256SUMS"
        else
            OUTPUT_FILE="$(dirname "$TARGET")/SHA256SUMS"
        fi
    fi
    
    return 0
}

build_find_command() {
    local target="$1"
    local cmd="find \"$target\" -type f"
    
    for pattern in "${EXCLUDE_PATTERNS[@]:-}"; do
        if [ -n "$pattern" ]; then
            cmd="$cmd ! -path \"$pattern\""
        fi
    done
    
    cmd="$cmd ! -name 'SHA256SUMS' ! -name 'SHA256SUMS.sig'"
    cmd="$cmd -print0 | sort -z | xargs -0 sha256sum"
    
    echo "$cmd"
}

generate_hashes() {
    log_info "生成 SHA-256 哈希清单..."
    log_info "目标: $TARGET"
    log_info "输出: $OUTPUT_FILE"
    
    if [ ${#EXCLUDE_PATTERNS[@]} -gt 0 ]; then
        log_info "排除模式: ${EXCLUDE_PATTERNS[*]}"
    fi
    
    local output_dir
    output_dir="$(dirname "$OUTPUT_FILE")"
    mkdir -p "$output_dir"
    
    local file_count=0
    
    if [ -f "$TARGET" ]; then
        log_detail "单文件模式"
        sha256sum "$TARGET" > "$OUTPUT_FILE"
        file_count=1
    elif [ -d "$TARGET" ]; then
        log_detail "目录模式"
        
        local find_cmd
        find_cmd=$(build_find_command "$TARGET")
        
        if [ "$VERBOSE" = true ]; then
            log_detail "执行命令: $find_cmd"
        fi
        
        cd "$TARGET"
        find . -type f \
            $(for p in "${EXCLUDE_PATTERNS[@]:-}"; do [ -n "$p" ] && echo "! -path \"$p\""; done) \
            ! -name 'SHA256SUMS' \
            ! -name 'SHA256SUMS.sig' \
            -print0 | sort -z | xargs -0 sha256sum > "$OUTPUT_FILE"
        cd - > /dev/null
        
        file_count=$(wc -l < "$OUTPUT_FILE" | tr -d ' ')
    fi
    
    log_success "哈希清单生成完成，共 $file_count 个文件"
    
    if [ "$VERBOSE" = true ] || [ "$QUIET" = false ]; then
        echo ""
        log_detail "哈希清单内容:"
        cat "$OUTPUT_FILE"
        echo ""
    fi
    
    local root_hash
    root_hash=$(sha256sum "$OUTPUT_FILE" | awk '{print $1}')
    log_info "清单整体哈希: $root_hash"
    
    echo "$root_hash  ROOT_HASH" >> "$OUTPUT_FILE"
    
    return 0
}

verify_hashes() {
    log_info "校验 SHA-256 哈希..."
    log_info "目标: $TARGET"
    log_info "预期文件: $EXPECTED_FILE"
    
    local passed=0
    local failed=0
    local missing=0
    local total=0
    
    local fail_files=()
    local missing_files=()
    
    if [ -f "$TARGET" ]; then
        local expected_hash
        expected_hash=$(grep -F "$(basename "$TARGET")" "$EXPECTED_FILE" | awk '{print $1}' | head -1)
        
        if [ -z "$expected_hash" ]; then
            log_error "在预期文件中未找到目标文件的哈希记录"
            exit 1
        fi
        
        local actual_hash
        actual_hash=$(sha256sum "$TARGET" | awk '{print $1}')
        
        if [ "$actual_hash" = "$expected_hash" ]; then
            log_success "哈希校验通过: $TARGET"
            return 0
        else
            log_error "哈希校验失败: $TARGET"
            log_error "  预期: $expected_hash"
            log_error "  实际: $actual_hash"
            return 1
        fi
    fi
    
    cd "$TARGET"
    
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        [[ "$line" == *"ROOT_HASH"* ]] && continue
        
        total=$((total + 1))
        
        local expected_hash
        local file_path
        expected_hash=$(echo "$line" | awk '{print $1}')
        file_path=$(echo "$line" | awk '{$1=""; print $0}' | sed 's/^[ *]*//')
        
        if [ "$VERBOSE" = true ]; then
            log_detail "校验: $file_path"
        fi
        
        if [ ! -f "$file_path" ]; then
            missing=$((missing + 1))
            missing_files+=("$file_path")
            if [ "$QUIET" = false ]; then
                log_warn "文件缺失: $file_path"
            fi
            continue
        fi
        
        local actual_hash
        actual_hash=$(sha256sum "$file_path" | awk '{print $1}')
        
        if [ "$actual_hash" = "$expected_hash" ]; then
            passed=$((passed + 1))
        else
            failed=$((failed + 1))
            fail_files+=("$file_path")
            if [ "$QUIET" = false ]; then
                log_error "哈希不匹配: $file_path"
                log_error "  预期: $expected_hash"
                log_error "  实际: $actual_hash"
            fi
        fi
        
    done < "$EXPECTED_FILE"
    
    cd - > /dev/null
    
    echo ""
    log_info "=========================================="
    log_info "  校验结果汇总"
    log_info "=========================================="
    log_info "  总文件数: $total"
    log_info "  通过: $passed"
    log_info "  失败: $failed"
    log_info "  缺失: $missing"
    log_info "=========================================="
    echo ""
    
    if [ $failed -eq 0 ] && [ $missing -eq 0 ]; then
        log_success "所有文件哈希校验通过"
        return 0
    else
        log_error "哈希校验未通过"
        
        if [ ${#fail_files[@]} -gt 0 ] && [ "$VERBOSE" = false ]; then
            log_error "失败的文件:"
            for f in "${fail_files[@]}"; do
                log_error "  - $f"
            done
        fi
        
        if [ ${#missing_files[@]} -gt 0 ] && [ "$VERBOSE" = false ]; then
            log_error "缺失的文件:"
            for f in "${missing_files[@]}"; do
                log_error "  - $f"
            done
        fi
        
        return 1
    fi
}

sign_hash_file() {
    if command -v gpg &> /dev/null && [ -n "${GPG_KEY_ID:-}" ]; then
        log_info "使用 GPG 签名哈希清单..."
        gpg --armor --detach-sign --default-key "$GPG_KEY_ID" "$OUTPUT_FILE"
        log_success "签名已生成: $OUTPUT_FILE.sig"
    fi
}

main() {
    parse_args "$@"
    validate_args
    
    echo ""
    log_info "=========================================="
    log_info "  SHA-256 哈希校验工具 v1.0.0"
    log_info "  模式: $MODE"
    log_info "=========================================="
    echo ""
    
    case "$MODE" in
        generate)
            generate_hashes
            sign_hash_file
            ;;
        verify)
            verify_hashes
            ;;
    esac
    
    exit $?
}

main "$@"
