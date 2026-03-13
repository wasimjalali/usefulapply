import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Karko AI | AI-Powered Job Application Assistant';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0F1B3D 0%, #1A2D5A 60%, #0F1B3D 100%)',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background decorative circles */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            right: '-120px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'rgba(200, 164, 78, 0.08)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-150px',
            left: '-100px',
            width: '420px',
            height: '420px',
            borderRadius: '50%',
            background: 'rgba(200, 164, 78, 0.06)',
            display: 'flex',
          }}
        />

        {/* Logo row: K icon + wordmark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            marginBottom: '48px',
          }}
        >
          {/* K icon box */}
          <div
            style={{
              width: '88px',
              height: '88px',
              borderRadius: '20px',
              background: '#C8A44E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: '52px',
                fontWeight: '900',
                color: '#0F1B3D',
                lineHeight: 1,
              }}
            >
              K
            </span>
          </div>

          {/* Wordmark */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
            <span
              style={{
                fontSize: '72px',
                fontWeight: '800',
                color: '#FFFFFF',
                letterSpacing: '-2px',
                lineHeight: 1,
              }}
            >
              Karko
            </span>
            <span
              style={{
                fontSize: '72px',
                fontWeight: '700',
                color: '#C8A44E',
                letterSpacing: '-2px',
                lineHeight: 1,
              }}
            >
              AI
            </span>
          </div>
        </div>

        {/* Tagline */}
        <p
          style={{
            fontSize: '32px',
            fontWeight: '500',
            color: 'rgba(255,255,255,0.85)',
            margin: '0 0 40px 0',
            letterSpacing: '0px',
            textAlign: 'center',
            maxWidth: '800px',
          }}
        >
          AI-Powered Job Application Assistant
        </p>

        {/* Divider */}
        <div
          style={{
            width: '80px',
            height: '3px',
            background: '#C8A44E',
            borderRadius: '2px',
            marginBottom: '40px',
            display: 'flex',
          }}
        />

        {/* Three value props */}
        <div
          style={{
            display: 'flex',
            gap: '32px',
            alignItems: 'center',
          }}
        >
          {['Tailored CV', 'Cover Letter', 'Application Email'].map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#C8A44E',
                  display: 'flex',
                }}
              />
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: '600',
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                {item}
              </span>
            </div>
          ))}
        </div>

        {/* Bottom URL */}
        <p
          style={{
            position: 'absolute',
            bottom: '36px',
            fontSize: '18px',
            fontWeight: '500',
            color: 'rgba(200, 164, 78, 0.7)',
            margin: 0,
          }}
        >
          karkoai.com
        </p>
      </div>
    ),
    { ...size }
  );
}
