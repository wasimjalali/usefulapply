/**
 * Password Strength Checker
 * Returns strength score and feedback for password validation
 */

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4; // 0=very weak, 4=very strong
  feedback: string;
  color: 'red' | 'orange' | 'yellow' | 'lime' | 'green';
  percentage: number;
}

export function checkPasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return {
      score: 0,
      feedback: 'Enter a password',
      color: 'red',
      percentage: 0,
    };
  }

  let score = 0;
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  // Length check (most important)
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;

  // Character variety
  if (checks.uppercase && checks.lowercase) score++;
  if (checks.number) score++;
  if (checks.special) score++;

  // Cap at 4
  score = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;

  const feedbackMap: Record<number, string> = {
    0: 'Very weak - Too short',
    1: 'Weak - Add more characters',
    2: 'Fair - Add numbers or symbols',
    3: 'Good - Strong enough',
    4: 'Excellent - Very secure',
  };

  const colorMap: Record<number, 'red' | 'orange' | 'yellow' | 'lime' | 'green'> = {
    0: 'red',
    1: 'orange',
    2: 'yellow',
    3: 'lime',
    4: 'green',
  };

  return {
    score: score as 0 | 1 | 2 | 3 | 4,
    feedback: feedbackMap[score],
    color: colorMap[score],
    percentage: (score / 4) * 100,
  };
}
