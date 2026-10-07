-- ایندکس روی (is_active, end_date) برای فیلتر «قواعد فعال و منقضی‌نشده».
--
-- کوئری خواندن قواعد موتور به‌شکل زیر است:
--   WHERE is_active = true AND (kind = 'weekday' OR end_date >= today)
-- این ایندکس اسکن را روی ردیف‌های فعال و غیرمنقضی محدود می‌کند.
CREATE INDEX "price_rules_is_active_end_date_idx" ON "price_rules"("is_active", "end_date");
