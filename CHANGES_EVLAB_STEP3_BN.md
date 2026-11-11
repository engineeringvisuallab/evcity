# EVLab Step 3: screen-e lekha text remove

- `src/missions/PresentationHall.ts`: mission-er screen-er icon, slide title ar bullet point remove. Screen ekhon faka (blank). `renderPage` ar `ui` theke oi 3 ta field-o gelo.
- `src/evlab/EVLabHall.ts`: real hall-er LED screen-e kono text nei ("EVLAB PRESENTATION HALL", slide icon/title/bullet shob gelo). Shudhu gradient ar gold border. `showSlide(slide, topic)` signature ager moto (caller bhangbe na), kintu ekhon kichu lekhe na.
- Rakha hoyeche: topic card, niche-r 3 line caption (eta pore voice-e read korte hoy, marks eta theke), banner, result card. Scoring, voice, pages ager moto.
- Test: `scripts/mission-test.ts` pass. `HallTopics` slide data ager moto (pages ei theke toiri).
