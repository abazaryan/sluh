# Слух

Карточки с голосовым ответом: интервальные повторения, где оценка выставляется автоматически по точности и скорости ответа.

- Спецификация: [docs/SPEC.md](docs/SPEC.md)
- Прототип: [prototype/sluh.html](prototype/sluh.html)

## Команды

```bash
npm install
npm run dev     # локальный сервер
npm test        # юнит-тесты (Vitest)
npm run build   # проверка типов и сборка в dist/
```

## Структура

- `src/core/` — чистая логика: сверка ответа, оценка, колода, настройки, журнал, ход серии карточек.
- `src/platform/` — браузерные API: распознавание и синтез речи, localStorage, микрофон, буфер обмена.
- `src/ui/` — интерфейс на React.

Публикация — GitHub Pages через `.github/workflows/deploy.yml` при каждом push в `main`.
