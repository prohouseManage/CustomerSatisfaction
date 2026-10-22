export default function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? 'brand-light' : ''}`}>
      <img src="/house-of-training.svg" width={159} height={50} alt="House of Training" />
    </div>
  );
}
