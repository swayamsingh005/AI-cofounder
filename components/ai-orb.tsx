export default function AiOrb({ size = 64 }: { size?: number }) {
  return (
    <div className="ai-orb" style={{ width: size, height: size }}>
      <div className="ai-orb-ring" />
      <div className="ai-orb-sphere">
        <span className="ai-orb-eye" /><span className="ai-orb-eye" />
      </div>
    </div>
  );
}
