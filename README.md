# BAYROQ QUEST 🇺🇿

25 savolli premium quiz: alohida talaba kirishi, serverda baholash va doimiy MongoDB Atlas reytingi.

## Render sozlash

Render > bayroq-quest > Environment:

- `MONGODB_URI`: MongoDB Atlas SRV ulanish satri (faqat Render Environment, GitHub'ga yozmang)
- `MONGODB_DB_NAME`: `bayroq_quest` (ixtiyoriy)

Atlas Network Access'da Render serverining chiqish IP manzil(lar)iga ruxsat bering; bepul reja va o‘zgaruvchan IP holatida faqat zarur bo‘lsa vaqtinchalik kengroq ruxsatdan foydalaning. Database user maxsus o‘qish/yozish huquqli bo‘lsin.

`npm install && npm start`

### URL

`/` — talaba quiz; `/api/leaderboard` — reyting; `/health` — server holati.

### Ma'lumotlar barqarorligi

Barcha urinishlar MongoDB Atlas'ga yoziladi. Render qayta ishga tushishi/deploy ma'lumotlarni o‘chirmaydi. MongoDB URI sozlanmaganida natijalar saqlanmaydi va sayt faqat bazaga ulanish xatosini ko‘rsatadi.

### Maxfiylik

Reytingda ism, familiya va guruh hammaga ochiq. Testni faqat ruxsat berilgan guruhlarga ulashing. Savollar serverdan javobsiz olinadi; tekshiruv serverda amalga oshiriladi.
