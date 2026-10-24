/** Official brand marks for the landing "paste from anywhere" grid. */

import Image from 'next/image';

function Mark({
  label,
  color,
  children,
}: {
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 flex-shrink-0"
        aria-hidden
        fill={color}
      >
        <title>{label}</title>
        {children}
      </svg>
      <span className="text-[15px] font-semibold text-navy-800 sm:text-[16px]">{label}</span>
    </span>
  );
}

const BOARDS: { name: string; color: string; path: string; viewBox?: string }[] = [
  {
    name: 'LinkedIn',
    color: '#0A66C2',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
  {
    name: 'Indeed',
    color: '#003A9B',
    path: 'M11.566 21.5633v-8.762c.2553.0231.5009.0346.758.0346 1.2225 0 2.3739-.3206 3.3506-.8928v9.6182c0 .8219-.1957 1.4287-.5757 1.8338-.378.4033-.8808.6049-1.491.6049-.6007 0-1.0766-.2016-1.468-.6183-.3781-.4032-.5739-1.01-.5739-1.8184zM11.589.5659c2.5447-.8929 5.4424-.8449 7.6186.987.405.3687.8673.8334 1.0515 1.3806.2207.6913-.7695-.073-.9057-.167-.71-.4532-1.4182-.8334-2.2127-1.0946C12.8614.3873 8.8122 2.709 6.2945 6.315c-1.0516 1.5939-1.7367 3.2721-2.299 5.1174-.0614.2017-.1094.4647-.2207.6413-.1113.2036-.048-.5453-.048-.5702.0845-.7623.2438-1.4997.4414-2.237C5.3292 5.3375 7.897 2.0655 11.5891.5658zm4.9281 7.0587c0 1.6686-1.353 3.0224-3.0205 3.0224-1.6677 0-3.0186-1.3538-3.0186-3.0224 0-1.6687 1.351-3.0224 3.0186-3.0224 1.6676 0 3.0205 1.3518 3.0205 3.0224Z',
  },
  {
    name: 'Glassdoor',
    color: '#0CAA41',
    path: 'M14.1093.0006c-.0749-.0074-.1348.0522-.1348.127v3.451c0 .0673.0537.1194.121.127 2.619.172 4.6092.9501 4.6092 3.6814H13.086a.1343.1343 0 0 0-.1348.1347v8.9644c0 .0748.06.1347.1348.1347h10.0034c.0748 0 .1347-.0599.1347-.1347V7.342c0-2.2374-.7996-4.0558-2.4159-5.3279C19.3191.8469 17.0874.1428 14.1093.0006ZM.9107 7.387a.1342.1342 0 0 0-.1347.1347v8.9566c0 .0748.06.1347.1347.1347h5.6189c0 2.7313-1.9902 3.5094-4.6091 3.6815-.0674.0075-.1192.0596-.1192.127v3.451c0 .0747.06.1343.1348.1269 2.9781-.1422 5.2078-.8463 6.6969-2.0136 1.6163-1.272 2.4159-3.0905 2.4159-5.3278V7.5217a.1343.1343 0 0 0-.1348-.1347z',
  },
  {
    name: 'Monster',
    color: '#6E46AE',
    path: 'M0 0V24H5.42V12.39L12 18.19L18.58 12.39V24H24V0L12 11.23L0 0Z',
  },
  {
    name: 'Wellfound',
    color: '#000000',
    path: 'M23.998 8.128c.063-1.379-1.612-2.376-2.795-1.664-1.23.598-1.322 2.52-.156 3.234 1.2.862 2.995-.09 2.951-1.57zm0 7.748c.063-1.38-1.612-2.377-2.795-1.665-1.23.598-1.322 2.52-.156 3.234 1.2.863 2.995-.09 2.951-1.57zm-20.5 1.762L0 6.364h3.257l2.066 8.106 2.245-8.106h3.267l2.244 8.106 2.065-8.106h3.257l-3.54 11.274H11.39c-.73-2.713-1.46-5.426-2.188-8.14l-2.233 8.14H3.5z',
  },
  {
    name: 'Handshake',
    color: '#1A1A1A',
    path: 'M20.728 0 16.49 24h-4.583l1.87-10.532-4.743 3.893L7.856 24H3.272L7.51 0h4.582L9.806 13.012l4.729-3.862L16.145 0h4.583z',
  },
];

function ZipRecruiterMark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        viewBox="0 0 54 96"
        className="h-5 w-5 flex-shrink-0"
        aria-hidden
      >
        <title>ZipRecruiter</title>
        <path
          fill="#B2E522"
          fillRule="evenodd"
          d="M52.9 26.5c-.6-.2-1.3-.1-2 .1l-2.7.9V2.4c0-1.3-1.1-2.4-2.4-2.4H10.3C9 0 7.9 1.1 7.9 2.4v25.2l-2.7-.9c-.7-.2-1.4-.3-2-.1-1 .2-3.2 1.2-3.2 5.1v21c.3 1.8 1.5 3.9 4.2 3.9h9c.9 1.1 3.1 2.9 7.3 3.2.1 3.1 1.9 5.7 4.6 6.8v5.9c0 .1-.1.2-.2.2-12.6.4-20.6 4.4-22.9 5.7C.6 79.2.3 80.9.3 82v4.6c.1 1.6 1.4 2.9 3.1 2.9 1.5 0 2.8-1.3 2.9-2.8.1-1.5-.9-2.7-2.3-3.1-.1 0-.2-.1-.2-.2v-1.7c0-.4.2-.8.6-1 3.4-1.9 12.1-2.8 18.7-3.2H25c.1 0 .2.1.2.2.3 5.3.9 9.8 1.1 12.6h-.2c-1.1 0-2.1 1.3-2.1 3s1 3 2.1 3h4c1.1 0 2.1-1.3 2.1-3s-1-3-2.1-3h-.2s.7-7.3 1.1-12.6c0-.1.1-.2.2-.2h1.9c6.6.3 15.3 1.3 18.7 3.2.4.2.6.6.6 1v1.7c0 .1-.1.2-.2.2-1.4.3-2.4 1.6-2.3 3.1.1 1.5 1.4 2.8 2.9 2.8 1.6 0 3-1.2 3.1-2.9V82c0-1.1-.3-2.7-1.7-3.6-2.3-1.3-10.4-5.3-22.9-5.8-.1 0-.2-.1-.2-.2v-5.9c2.7-1.1 4.5-3.7 4.6-6.8 4.1-.3 6.3-2.2 7.3-3.2h9c2.7 0 3.9-2.1 4.2-3.9v-21c-.1-3.9-2.3-4.8-3.3-5.1zm-45 21.8l-4.1 3.1c-.1.1-.2 0-.2-.1V31.6c0-.8.1-1.8.5-1.7l3.6 1.2c.1 0 .2.2.2.3v16.9zm44.5 3.1l-4.1-3.1V31.5c0-.1.1-.2.2-.3l3.6-1.2c.5-.1.5.9.5 1.7v19.7s-.1.1-.2 0z"
        />
      </svg>
      <span className="text-[15px] font-semibold text-navy-800 sm:text-[16px]">ZipRecruiter</span>
    </span>
  );
}

const RASTER_MARKS: Record<string, string> = {
  Dice: '/images/boards/dice.png',
  CareerBuilder: '/images/boards/careerbuilder.png',
};

export const JOB_BOARD_NAMES = [
  'LinkedIn',
  'Indeed',
  'Glassdoor',
  'ZipRecruiter',
  'Monster',
  'Wellfound',
  'Handshake',
  'Dice',
  'CareerBuilder',
] as const;

function RasterMark({ name, src }: { name: string; src: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src={src}
        alt=""
        width={40}
        height={40}
        unoptimized
        className="h-5 w-5 flex-shrink-0 rounded-control"
      />
      <span className="text-[15px] font-semibold text-navy-800 sm:text-[16px]">{name}</span>
    </span>
  );
}

export function JobBoardMark({ name }: { name: string }) {
  if (name === 'ZipRecruiter') return <ZipRecruiterMark />;
  const raster = RASTER_MARKS[name];
  if (raster) return <RasterMark name={name} src={raster} />;
  const board = BOARDS.find((item) => item.name === name);
  if (!board) return <span className="text-[15px] font-semibold text-navy-800">{name}</span>;
  return (
    <Mark label={board.name} color={board.color}>
      <path d={board.path} />
    </Mark>
  );
}
