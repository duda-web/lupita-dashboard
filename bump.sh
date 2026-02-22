#!/bin/bash
# Auto-bump version in client/src/lib/version.ts
# Format: v.YYYYMMDD-X (X increments per day, resets to 1 on new day)

VERSION_FILE="client/src/lib/version.ts"
TODAY=$(date +%Y%m%d)

# Extract current version
CURRENT=$(grep "APP_VERSION = " "$VERSION_FILE" | sed "s/.*'v\.\(.*\)'.*/\1/")
CURRENT_DATE=$(echo "$CURRENT" | cut -d'-' -f1)
CURRENT_NUM=$(echo "$CURRENT" | cut -d'-' -f2)

if [ "$CURRENT_DATE" = "$TODAY" ]; then
  NEXT_NUM=$((CURRENT_NUM + 1))
else
  NEXT_NUM=1
fi

NEW_VERSION="v.${TODAY}-${NEXT_NUM}"

# Format date for display: "DD Mon YYYY"
MONTH_NAMES=("Jan" "Fev" "Mar" "Abr" "Mai" "Jun" "Jul" "Ago" "Set" "Out" "Nov" "Dez")
YEAR=${TODAY:0:4}
MONTH_IDX=$((10#${TODAY:4:2} - 1))
DAY=${TODAY:6:2}
DISPLAY_DATE="${DAY} ${MONTH_NAMES[$MONTH_IDX]} ${YEAR}"

cat > "$VERSION_FILE" << EOF
// App version — update this on every change
// Format: v.YYYYMMDD-X (X = version number for the day, starts at 1)
export const APP_VERSION = '${NEW_VERSION}';
export const APP_VERSION_DATE = '${DISPLAY_DATE}';
EOF

echo "✅ ${CURRENT_DATE}-${CURRENT_NUM} → ${NEW_VERSION}"
