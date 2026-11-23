export const sejGame = {
  name: "Warisan Negara Bangsa",
  detail: "Sejarah Tingkatan 4 · Bab 1 · Demo",
  path: "/sejarah/bab-1",
  cover: "/covers/sej-f4-bab-1",
};

export function SejarahGameCards({language}:{language:"zh"|"en"}) {
  return <ul className="tickgame-grid">
    <li>
      <a className="tickgame-card" href={`${sejGame.path}?lang=${language}`}>
        <img src={sejGame.cover} alt="" width={640} height={360} loading="lazy" decoding="async"/>
        <span>
          <strong>{sejGame.name}</strong>
          <small>{sejGame.detail}</small>
        </span>
      </a>
    </li>
  </ul>;
}
