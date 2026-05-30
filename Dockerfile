FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

# prisma generate DB bağlantısı gerektirmez — sadece schema'dan client üretir
COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# next build dynamic App Router sayfalarında DB bağlantısı açmaz.
# Eğer Railway build adımında DATABASE_URL gerekirse, Railway Settings →
# Build Environment Variables'a ekle. Runtime env Railway tarafından inject edilir.
RUN npm run build

EXPOSE 3000

# Railway PORT env değişkenini inject eder; next start bunu otomatik okur.
CMD ["npm", "start"]
