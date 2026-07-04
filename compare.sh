#!/bin/bash
PROD=$1
TEST=$2

files=(
  "src/app/api/activity/route.ts"
  "src/app/api/ai-incidents/route.ts"
  "src/app/api/auth/forgot-password/route.ts"
  "src/app/api/auth/invitation-details/route.ts"
  "src/app/api/auth/magic-login/route.ts"
  "src/app/api/companies/[id]/route.ts"
  "src/app/api/companies/route.ts"
  "src/app/api/docs/playground/proxy/route.ts"
  "src/app/api/documents/bulk-update-field/route.ts"
  "src/app/api/documents/check-duplicates/route.ts"
  "src/app/api/documents/[id]/field/route.ts"
  "src/app/api/documents/[id]/route.ts"
  "src/app/api/entidades-config/route.ts"
  "src/app/api/export-dashboard/route.ts"
  "src/app/api/export-documents/route.ts"
  "src/app/api/productos/classify/route.ts"
  "src/app/api/productos-config/route.ts"
  "src/app/api/proveedores/[id]/route.ts"
  "src/app/api/send-dashboard-email/route.ts"
  "src/app/api/trimestres/documentos-sii/route.ts"
  "src/app/api/upload-progress/route.ts"
  "src/app/api/v1/documents/full/route.ts"
  "src/app/api/v1/documents/route.ts"
  "src/app/api/v1/export/excel/route.ts"
  "src/app/api/v1/incidents/route.ts"
  "src/app/api/v1/products/route.ts"
  "src/app/api/v1/quarters/route.ts"
  "src/app/dashboard/webhooks/page.tsx"
  "src/app/settings/page.tsx"
  "src/components/dashboard/grouped-documents-view.tsx"
  "src/hooks/use-duplicate-detection.ts"
  "src/lib/encryption.ts"
  "src/services/api-key-service.ts"
  "src/services/auth-service.ts"
  "src/services/document-service.ts"
  "src/services/incidents-service.ts"
  "src/services/invitation-service.ts"
  "src/services/upload-service.ts"
  "src/services/user-service.ts"
  "src/services/vertex-ai-service.ts"
  "src/services/webhook-service.ts"
)

for f in "${files[@]}"; do
  if [ -f "$PROD/$f" ] && [ -f "$TEST/$f" ]; then
    diff -u "$PROD/$f" "$TEST/$f" > "/tmp/diff_output.txt"
    if [ -s "/tmp/diff_output.txt" ]; then
       # Filter out common Prisma vs SQL changes
       filtered=$(cat "/tmp/diff_output.txt" | grep -vE "^(\+|\-).*(prisma\.|db\.query|RowDataPacket|import.*db|import.*prisma|from '@/lib/db')")
       # If the filtered diff still has changes other than just headers/context
       if echo "$filtered" | grep -qE "^(\+|\-)"; then
          echo "==== $f ===="
          echo "$filtered" | head -n 30
          echo "..."
       fi
    fi
  fi
done
