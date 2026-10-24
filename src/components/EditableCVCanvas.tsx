'use client';

import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Edit3, Check, X, Sparkles, Plus, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react';
import { CVData } from '@/lib/cv-templates/types';

interface EditableCVCanvasProps {
  cvData: CVData;
  onSave: (updatedData: CVData) => void;
  onAIImprove?: (section: string, content: string) => Promise<string>;
}

export interface EditableCVCanvasRef {
  save: () => void;
}

type HideableList = 'experience' | 'education' | 'certifications' | 'languages' | 'projects' | 'customSections';
type HideableSection = NonNullable<CVData['hiddenSections']>[number];

/**
 * Hides one thing from the canvas and every export without deleting it. The
 * flag lives in the CV itself (`hidden`), so a hidden item keeps its text and
 * comes back with one click.
 */
function HideToggle({ hidden, onToggle, label }: { hidden: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={hidden}
      title={hidden ? `Show ${label} on the CV` : `Hide ${label} from the CV`}
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium transition-colors duration-(--duration-base) cursor-pointer ${
        hidden ? 'bg-canvas text-brand-strong hover:bg-sunken' : 'text-ink-muted hover:text-brand-strong'
      }`}
    >
      {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      {hidden ? 'Hidden' : null}
    </button>
  );
}

interface EditableFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  label?: string;
}

function EditableField({ value, onChange, placeholder, multiline, className = '', label }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  const handleSave = () => {
    onChange(tempValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="relative group">
        {label && <span className="text-xs text-ink-muted mb-1 block">{label}</span>}
        {multiline ? (
          <textarea
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            placeholder={placeholder}
            className={`w-full p-2 border-2 border-border-brand rounded focus:border-border-focus focus:outline-none resize-none ${className}`}
            rows={4}
            autoFocus
          />
        ) : (
          <input
            type="text"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            placeholder={placeholder}
            className={`w-full p-2 border-2 border-border-brand rounded focus:border-border-focus focus:outline-none ${className}`}
            autoFocus
          />
        )}
        <div className="flex gap-1 mt-1">
          <button onClick={handleSave} className="p-1 bg-accent-strong text-accent-ink rounded hover:bg-accent-deep cursor-pointer" title="Save">
            <Check className="w-3 h-3" />
          </button>
          <button onClick={handleCancel} className="p-1 bg-danger-bright text-ink-inverse rounded hover:bg-danger cursor-pointer" title="Cancel">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`group cursor-pointer hover:bg-brand-soft rounded px-1 -mx-1 transition-colors ${className}`}
      onClick={() => setIsEditing(true)}
    >
      {label && <span className="text-xs text-ink-muted mb-1 block">{label}</span>}
      <span className={value ? '' : 'text-ink-muted italic'}>
        {value || placeholder || 'Click to edit'}
      </span>
      <Edit3 className="w-3 h-3 inline-block ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />
    </div>
  );
}

export const EditableCVCanvas = forwardRef<EditableCVCanvasRef, EditableCVCanvasProps>(
  ({ cvData, onSave, onAIImprove }, ref) => {
    const [data, setData] = useState<CVData>(cvData);
    const [hasChanges, setHasChanges] = useState(false);
    const [isAIProcessing, setIsAIProcessing] = useState<string | null>(null);

    // Sync internal state when cvData prop changes externally (e.g., tab switch, regeneration)
    useEffect(() => {
      if (!hasChanges) {
        setData(cvData);
      }
    }, [cvData, hasChanges]);

    const updateField = useCallback((path: string, value: string | string[]) => {
      setData(prev => {
        const newData = JSON.parse(JSON.stringify(prev));
        const keys = path.split('.');
        let obj = newData;
        for (let i = 0; i < keys.length - 1; i++) {
          obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        return newData;
      });
      setHasChanges(true);
    }, []);

    const handleSave = useCallback(() => {
      onSave(data);
      setHasChanges(false);
    }, [data, onSave]);

    // Expose save method to parent via ref
    useImperativeHandle(ref, () => ({
      save: handleSave,
    }), [handleSave]);

  const handleAIImprove = async (section: string, content: string) => {
    if (!onAIImprove) return;
    setIsAIProcessing(section);
    try {
      const improved = await onAIImprove(section, content);
      if (section === 'summary') {
        updateField('summary', improved);
      }
    } catch (error) {
      console.error('AI improvement failed:', error);
    } finally {
      setIsAIProcessing(null);
    }
  };

  const toggleEntryHidden = (list: HideableList, index: number) => {
    setData(prev => {
      const items = [...((prev[list] as Array<{ hidden?: boolean }> | undefined) ?? [])];
      items[index] = { ...items[index], hidden: items[index].hidden ? undefined : true };
      return { ...prev, [list]: items } as CVData;
    });
    setHasChanges(true);
  };

  const toggleEntryHiddenSkillGroup = (index: number) => {
    setData(prev => {
      const skills = [...prev.skills];
      skills[index] = { ...skills[index], hidden: skills[index].hidden ? undefined : true };
      return { ...prev, skills };
    });
    setHasChanges(true);
  };

  const toggleSkillItemHidden = (categoryIndex: number, skill: string) => {
    setData(prev => {
      const skills = [...prev.skills];
      const hiddenItems = skills[categoryIndex].hiddenItems ?? [];
      const next = hiddenItems.includes(skill) ? hiddenItems.filter(item => item !== skill) : [...hiddenItems, skill];
      skills[categoryIndex] = { ...skills[categoryIndex], hiddenItems: next.length > 0 ? next : undefined };
      return { ...prev, skills };
    });
    setHasChanges(true);
  };

  const toggleSectionHidden = (section: HideableSection) => {
    setData(prev => {
      const current = prev.hiddenSections ?? [];
      const next = current.includes(section) ? current.filter(item => item !== section) : [...current, section];
      return { ...prev, hiddenSections: next.length > 0 ? next : undefined };
    });
    setHasChanges(true);
  };

  const sectionHidden = (section: HideableSection) => data.hiddenSections?.includes(section) ?? false;
  const dim = (hidden: boolean | undefined) => (hidden ? 'opacity-50' : '');

  const addExperienceBullet = (expIndex: number) => {
    const newBullets = [...data.experience[expIndex].bullets, ''];
    const newExperience = [...data.experience];
    newExperience[expIndex] = { ...newExperience[expIndex], bullets: newBullets };
    setData(prev => ({ ...prev, experience: newExperience }));
    setHasChanges(true);
  };

  const updateExperienceBullet = (expIndex: number, bulletIndex: number, value: string) => {
    const newBullets = [...data.experience[expIndex].bullets];
    newBullets[bulletIndex] = value;
    const newExperience = [...data.experience];
    newExperience[expIndex] = { ...newExperience[expIndex], bullets: newBullets };
    setData(prev => ({ ...prev, experience: newExperience }));
    setHasChanges(true);
  };

  const removeExperienceBullet = (expIndex: number, bulletIndex: number) => {
    const newBullets = data.experience[expIndex].bullets.filter((_, i) => i !== bulletIndex);
    const newExperience = [...data.experience];
    newExperience[expIndex] = { ...newExperience[expIndex], bullets: newBullets };
    setData(prev => ({ ...prev, experience: newExperience }));
    setHasChanges(true);
  };

  const addSkill = (categoryIndex: number) => {
    const newItems = [...data.skills[categoryIndex].items, ''];
    const newSkills = [...data.skills];
    newSkills[categoryIndex] = { ...newSkills[categoryIndex], items: newItems };
    setData(prev => ({ ...prev, skills: newSkills }));
    setHasChanges(true);
  };

  const updateSkill = (categoryIndex: number, skillIndex: number, value: string) => {
    const group = data.skills[categoryIndex];
    const newItems = [...group.items];
    const previous = newItems[skillIndex];
    newItems[skillIndex] = value;
    // A skill is hidden by its text, so renaming carries the hide state to the new text
    // instead of silently showing it again.
    let hiddenItems = group.hiddenItems;
    if (hiddenItems && previous !== value && hiddenItems.includes(previous)) {
      const stillThere = newItems.some((item, index) => index !== skillIndex && item === previous);
      hiddenItems = [...hiddenItems.filter((item) => stillThere || item !== previous), value];
    }
    const newSkills = [...data.skills];
    newSkills[categoryIndex] = { ...group, items: newItems, hiddenItems };
    setData(prev => ({ ...prev, skills: newSkills }));
    setHasChanges(true);
  };

  const removeSkill = (categoryIndex: number, skillIndex: number) => {
    const group = data.skills[categoryIndex];
    const removed = group.items[skillIndex];
    const newItems = group.items.filter((_, i) => i !== skillIndex);
    // A deleted skill takes its hide state with it (unless an identical skill remains).
    const hiddenItems = group.hiddenItems?.filter((item) => item !== removed || newItems.includes(removed));
    const newSkills = [...data.skills];
    newSkills[categoryIndex] = { ...group, items: newItems, hiddenItems: hiddenItems && hiddenItems.length > 0 ? hiddenItems : undefined };
    setData(prev => ({ ...prev, skills: newSkills }));
    setHasChanges(true);
  };

  return (
    <div className="bg-document rounded-control shadow-floating p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border-strong">
        <Edit3 className="w-5 h-5 text-brand" />
        <h2 className="text-lg font-semibold text-ink-body">Edit Your CV</h2>
        {hasChanges && (
          <span className="px-2 py-0.5 text-xs bg-accent-soft-strong text-accent-soft-ink rounded-pill">
            Unsaved changes
          </span>
        )}
      </div>

      {/* Personal Information */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-brand mb-3">
          Personal Information
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <EditableField
            label="Full Name"
            value={data.personal.fullName}
            onChange={(v) => updateField('personal.fullName', v)}
            placeholder="Your full name"
          />
          <EditableField
            label="Professional Title"
            value={data.personal.currentTitle || ''}
            onChange={(v) => updateField('personal.currentTitle', v)}
            placeholder="e.g., Senior Software Engineer"
          />
          <EditableField
            label="Email"
            value={data.personal.email}
            onChange={(v) => updateField('personal.email', v)}
            placeholder="your@email.com"
          />
          <EditableField
            label="Phone"
            value={data.personal.phone}
            onChange={(v) => updateField('personal.phone', v)}
            placeholder="+1 234 567 8900"
          />
          <EditableField
            label="Address"
            value={data.personal.address || ''}
            onChange={(v) => updateField('personal.address', v)}
            placeholder="Street address"
          />
          <EditableField
            label="City"
            value={data.personal.city || ''}
            onChange={(v) => updateField('personal.city', v)}
            placeholder="City"
          />
          <EditableField
            label="Country"
            value={data.personal.country || ''}
            onChange={(v) => updateField('personal.country', v)}
            placeholder="Country"
          />
          <EditableField
            label="LinkedIn URL"
            value={data.personal.linkedIn || ''}
            onChange={(v) => updateField('personal.linkedIn', v)}
            placeholder="linkedin.com/in/yourprofile"
          />
          <EditableField
            label="GitHub URL"
            value={data.personal.github || ''}
            onChange={(v) => updateField('personal.github', v)}
            placeholder="github.com/yourusername"
          />
          <EditableField
            label="Portfolio URL"
            value={data.personal.portfolio || ''}
            onChange={(v) => updateField('personal.portfolio', v)}
            placeholder="yourportfolio.com"
          />
          <EditableField
            label="Website"
            value={data.personal.website || ''}
            onChange={(v) => updateField('personal.website', v)}
            placeholder="yourwebsite.com"
          />
        </div>
        
        {/* EU/German CV Optional Fields */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-ink-muted mb-3">Optional fields for EU/German CVs:</p>
          <div className="grid grid-cols-2 gap-4">
            <EditableField
              label="Date of Birth"
              value={data.personal.dateOfBirth || ''}
              onChange={(v) => updateField('personal.dateOfBirth', v)}
              placeholder="DD.MM.YYYY (optional)"
            />
            <EditableField
              label="Nationality"
              value={data.personal.nationality || ''}
              onChange={(v) => updateField('personal.nationality', v)}
              placeholder="e.g., German (optional)"
            />
          </div>
        </div>
      </section>
      
      {/* Signature Section for German CVs */}
      <section className="mb-6 p-4 bg-surface rounded-control border border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand">
            Signature (German CV)
          </h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.signature?.includeSignature || false}
              onChange={(e) => {
                const newSignature = {
                  city: data.signature?.city || data.personal.city || '',
                  date: data.signature?.date || new Date().toLocaleDateString('de-DE'),
                  signatureImageUrl: data.signature?.signatureImageUrl,
                  includeSignature: e.target.checked,
                };
                setData(prev => ({ ...prev, signature: newSignature }));
                setHasChanges(true);
              }}
              className="rounded border-border-strong"
            />
            <span className="text-ink-muted">Include signature line</span>
          </label>
        </div>
        {data.signature?.includeSignature && (
          <div className="grid grid-cols-2 gap-4">
            <EditableField
              label="City"
              value={data.signature?.city || ''}
              onChange={(v) => {
                setData(prev => ({ 
                  ...prev, 
                  signature: { ...prev.signature!, city: v }
                }));
                setHasChanges(true);
              }}
              placeholder="Berlin"
            />
            <EditableField
              label="Date (DD.MM.YYYY)"
              value={data.signature?.date || ''}
              onChange={(v) => {
                setData(prev => ({ 
                  ...prev, 
                  signature: { ...prev.signature!, date: v }
                }));
                setHasChanges(true);
              }}
              placeholder="31.01.2026"
            />
          </div>
        )}
        <p className="text-xs text-ink-muted mt-2">
          German CVs require a signature with city and date per 2026 standards.
        </p>
      </section>

      {/* Professional Summary */}
      <section className={`mb-6 ${dim(sectionHidden('summary'))}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand">
            Professional Summary
          </h3>
          <HideToggle hidden={sectionHidden('summary')} onToggle={() => toggleSectionHidden('summary')} label="the summary" />
          {onAIImprove && data.summary && (
            <button
              onClick={() => handleAIImprove('summary', data.summary || '')}
              disabled={isAIProcessing === 'summary'}
              className="flex items-center gap-1 text-xs text-brand hover:text-ink disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {isAIProcessing === 'summary' ? (
                <div className="w-3 h-3 border-2 border-border-brand border-t-brand rounded-pill animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              Improve with AI
            </button>
          )}
        </div>
        <EditableField
          value={data.summary || ''}
          onChange={(v) => updateField('summary', v)}
          placeholder="Write a compelling professional summary..."
          multiline
          className="text-sm"
        />
      </section>

      {/* Experience */}
      <section className={`mb-6 ${dim(sectionHidden('experience'))}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand">
            Professional Experience
          </h3>
          <HideToggle hidden={sectionHidden('experience')} onToggle={() => toggleSectionHidden('experience')} label="this section" />
        </div>
        {data.experience.map((exp, expIndex) => (
          <div key={exp.id} className={`mb-4 p-4 bg-surface rounded-control border border-border ${dim(exp.hidden)}`}>
            <div className="flex justify-end mb-1">
              <HideToggle hidden={Boolean(exp.hidden)} onToggle={() => toggleEntryHidden('experience', expIndex)} label="this role" />
            </div>
            <div className="flex items-start gap-2">
              <GripVertical className="w-4 h-4 text-ink-muted mt-1 cursor-grab" />
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <EditableField
                    label="Position"
                    value={exp.position}
                    onChange={(v) => {
                      const newExp = [...data.experience];
                      newExp[expIndex] = { ...newExp[expIndex], position: v };
                      setData(prev => ({ ...prev, experience: newExp }));
                      setHasChanges(true);
                    }}
                    placeholder="Job title"
                    className="font-medium"
                  />
                  <EditableField
                    label="Company"
                    value={exp.company}
                    onChange={(v) => {
                      const newExp = [...data.experience];
                      newExp[expIndex] = { ...newExp[expIndex], company: v };
                      setData(prev => ({ ...prev, experience: newExp }));
                      setHasChanges(true);
                    }}
                    placeholder="Company name"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <EditableField
                    label="Start Date"
                    value={exp.startDate}
                    onChange={(v) => {
                      const newExp = [...data.experience];
                      newExp[expIndex] = { ...newExp[expIndex], startDate: v };
                      setData(prev => ({ ...prev, experience: newExp }));
                      setHasChanges(true);
                    }}
                    placeholder="Jan 2020"
                    className="text-sm"
                  />
                  <EditableField
                    label="End Date"
                    value={exp.endDate || (exp.current ? 'Present' : '')}
                    onChange={(v) => {
                      const newExp = [...data.experience];
                      newExp[expIndex] = { ...newExp[expIndex], endDate: v, current: v.toLowerCase() === 'present' };
                      setData(prev => ({ ...prev, experience: newExp }));
                      setHasChanges(true);
                    }}
                    placeholder="Present"
                    className="text-sm"
                  />
                  <EditableField
                    label="Location"
                    value={exp.location || ''}
                    onChange={(v) => {
                      const newExp = [...data.experience];
                      newExp[expIndex] = { ...newExp[expIndex], location: v };
                      setData(prev => ({ ...prev, experience: newExp }));
                      setHasChanges(true);
                    }}
                    placeholder="City, Country"
                    className="text-sm"
                  />
                </div>
                
                {/* Bullets */}
                <div className="space-y-1">
                  <span className="text-xs text-ink-muted">Achievements & Responsibilities</span>
                  {exp.bullets.map((bullet, bulletIndex) => (
                    <div key={bulletIndex} className="flex items-start gap-2 group">
                      <span className="text-ink-muted mt-2">•</span>
                      <EditableField
                        value={bullet}
                        onChange={(v) => updateExperienceBullet(expIndex, bulletIndex, v)}
                        placeholder="Describe your achievement..."
                        className="flex-1 text-sm"
                      />
                      <button
                        onClick={() => removeExperienceBullet(expIndex, bulletIndex)}
                        className="p-1 text-danger-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Remove bullet point"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addExperienceBullet(expIndex)}
                    className="flex items-center gap-1 text-xs text-brand hover:text-ink mt-2 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Add bullet point
                  </button>
                </div>
              </div>
              <button
                onClick={() => {
                  const newExp = data.experience.filter((_, i) => i !== expIndex);
                  setData(prev => ({ ...prev, experience: newExp }));
                  setHasChanges(true);
                }}
                className="p-1 text-danger-muted hover:text-danger transition-colors cursor-pointer"
                title="Remove experience"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => {
            const newExperience = {
              id: `exp-${Date.now()}`,
              company: '',
              position: '',
              startDate: '',
              endDate: '',
              bullets: [''],
              location: '',
            };
            setData(prev => ({ ...prev, experience: [...prev.experience, newExperience] }));
            setHasChanges(true);
          }}
          className="flex items-center gap-1 text-xs text-brand hover:text-ink px-2 py-1 border border-dashed border-border-brand rounded cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          Add experience
        </button>
      </section>

      {/* Skills */}
      <section className={`mb-6 ${dim(sectionHidden('skills'))}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand">
            Skills
          </h3>
          <HideToggle hidden={sectionHidden('skills')} onToggle={() => toggleSectionHidden('skills')} label="this section" />
        </div>
        {data.skills.map((skillGroup, catIndex) => (
          <div key={`skill-cat-${catIndex}`} className={`mb-3 ${dim(skillGroup.hidden)}`}>
            <div className="flex items-center gap-2 mb-2">
              <EditableField
                label="Category"
                value={skillGroup.category}
                onChange={(v) => {
                  const newSkills = [...data.skills];
                  newSkills[catIndex] = { ...newSkills[catIndex], category: v };
                  setData(prev => ({ ...prev, skills: newSkills }));
                  setHasChanges(true);
                }}
                className="font-medium text-sm flex-1"
              />
              <HideToggle hidden={Boolean(skillGroup.hidden)} onToggle={() => toggleEntryHiddenSkillGroup(catIndex)} label="this skill group" />
              <button
                onClick={() => {
                  const newSkills = data.skills.filter((_, i) => i !== catIndex);
                  setData(prev => ({ ...prev, skills: newSkills }));
                  setHasChanges(true);
                }}
                className="p-1 text-danger-muted hover:text-danger transition-colors cursor-pointer"
                title="Remove skill category"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {skillGroup.items.map((skill, skillIndex) => (
                <div key={skillIndex} className={`flex items-center gap-1 bg-canvas rounded px-2 py-1 group ${dim(skillGroup.hiddenItems?.includes(skill))}`}>
                  <EditableField
                    value={skill}
                    onChange={(v) => updateSkill(catIndex, skillIndex, v)}
                    placeholder="Skill"
                    className="text-sm"
                  />
                  <HideToggle hidden={Boolean(skillGroup.hiddenItems?.includes(skill))} onToggle={() => toggleSkillItemHidden(catIndex, skill)} label="this skill" />
                  <button
                    onClick={() => removeSkill(catIndex, skillIndex)}
                    className="text-danger-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Remove skill"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => addSkill(catIndex)}
                className="flex items-center gap-1 text-xs text-brand hover:text-ink px-2 py-1 border border-dashed border-border-brand rounded cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                Add skill
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => {
            const newCategory = {
              category: '',
              items: [''],
            };
            setData(prev => ({ ...prev, skills: [...prev.skills, newCategory] }));
            setHasChanges(true);
          }}
          className="flex items-center gap-1 text-xs text-brand hover:text-ink px-2 py-1 border border-dashed border-border-brand rounded cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          Add skill category
        </button>
      </section>

      {/* Projects */}
      <section className={`mb-6 ${dim(sectionHidden('projects'))}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand">
            Projects
          </h3>
          <HideToggle hidden={sectionHidden('projects')} onToggle={() => toggleSectionHidden('projects')} label="this section" />
        </div>
        {(data.projects || []).map((proj, projIndex) => (
          <div key={proj.id || `proj-${projIndex}`} className={`mb-4 p-4 bg-surface rounded-control border border-border ${dim(proj.hidden)}`}>
            <div className="flex justify-end mb-1">
              <HideToggle hidden={Boolean(proj.hidden)} onToggle={() => toggleEntryHidden('projects', projIndex)} label="this project" />
            </div>
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <EditableField
                    label="Project Name"
                    value={proj.name}
                    onChange={(v) => {
                      const newProjects = [...(data.projects || [])];
                      newProjects[projIndex] = { ...newProjects[projIndex], name: v };
                      setData(prev => ({ ...prev, projects: newProjects }));
                      setHasChanges(true);
                    }}
                    placeholder="Project name"
                    className="font-medium"
                  />
                  <EditableField
                    label="URL (optional)"
                    value={proj.url || ''}
                    onChange={(v) => {
                      const newProjects = [...(data.projects || [])];
                      newProjects[projIndex] = { ...newProjects[projIndex], url: v || undefined };
                      setData(prev => ({ ...prev, projects: newProjects }));
                      setHasChanges(true);
                    }}
                    placeholder="https://..."
                    className="text-sm"
                  />
                </div>
                <EditableField
                  label="Description"
                  value={proj.description}
                  onChange={(v) => {
                    const newProjects = [...(data.projects || [])];
                    newProjects[projIndex] = { ...newProjects[projIndex], description: v };
                    setData(prev => ({ ...prev, projects: newProjects }));
                    setHasChanges(true);
                  }}
                  placeholder="1-2 sentences describing the project"
                  multiline
                  className="text-sm mb-2"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-xs text-ink-muted">Technologies:</span>
                  {(proj.technologies || []).map((tech, techIndex) => (
                    <div key={techIndex} className="flex items-center gap-1 bg-canvas rounded px-2 py-1 group">
                      <EditableField
                        value={tech}
                        onChange={(v) => {
                          const newProjects = [...(data.projects || [])];
                          const newTech = [...(newProjects[projIndex].technologies || [])];
                          newTech[techIndex] = v;
                          newProjects[projIndex] = { ...newProjects[projIndex], technologies: newTech };
                          setData(prev => ({ ...prev, projects: newProjects }));
                          setHasChanges(true);
                        }}
                        placeholder="Tech"
                        className="text-sm"
                      />
                      <button
                        onClick={() => {
                          const newProjects = [...(data.projects || [])];
                          const newTech = (newProjects[projIndex].technologies || []).filter((_, i) => i !== techIndex);
                          newProjects[projIndex] = { ...newProjects[projIndex], technologies: newTech };
                          setData(prev => ({ ...prev, projects: newProjects }));
                          setHasChanges(true);
                        }}
                        className="text-danger-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Remove technology"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newProjects = [...(data.projects || [])];
                      const newTech = [...(newProjects[projIndex].technologies || []), ''];
                      newProjects[projIndex] = { ...newProjects[projIndex], technologies: newTech };
                      setData(prev => ({ ...prev, projects: newProjects }));
                      setHasChanges(true);
                    }}
                    className="flex items-center gap-1 text-xs text-brand hover:text-ink px-2 py-1 border border-dashed border-border-brand rounded cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Add tech
                  </button>
                </div>
              </div>
              <button
                onClick={() => {
                  const newProjects = (data.projects || []).filter((_, i) => i !== projIndex);
                  setData(prev => ({ ...prev, projects: newProjects.length > 0 ? newProjects : undefined }));
                  setHasChanges(true);
                }}
                className="p-1 text-danger-muted hover:text-danger transition-colors cursor-pointer"
                title="Remove project"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => {
            const newProject = {
              id: `proj-${Date.now()}`,
              name: '',
              description: '',
              technologies: [],
            };
            setData(prev => ({ ...prev, projects: [...(prev.projects || []), newProject] }));
            setHasChanges(true);
          }}
          className="flex items-center gap-1 text-xs text-brand hover:text-ink px-2 py-1 border border-dashed border-border-brand rounded cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          Add project
        </button>
      </section>

      {/* Education */}
      <section className={`mb-6 ${dim(sectionHidden('education'))}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand">
            Education
          </h3>
          <HideToggle hidden={sectionHidden('education')} onToggle={() => toggleSectionHidden('education')} label="this section" />
        </div>
        {data.education.map((edu, eduIndex) => (
          <div key={edu.id} className={`mb-3 p-3 bg-surface rounded-control border border-border ${dim(edu.hidden)}`}>
            <div className="flex justify-end mb-1">
              <HideToggle hidden={Boolean(edu.hidden)} onToggle={() => toggleEntryHidden('education', eduIndex)} label="this entry" />
            </div>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-2">
              <EditableField
                label="Institution"
                value={edu.institution}
                onChange={(v) => {
                  const newEdu = [...data.education];
                  newEdu[eduIndex] = { ...newEdu[eduIndex], institution: v };
                  setData(prev => ({ ...prev, education: newEdu }));
                  setHasChanges(true);
                }}
                placeholder="University name"
                className="font-medium"
              />
              <EditableField
                label="Degree"
                value={edu.degree}
                onChange={(v) => {
                  const newEdu = [...data.education];
                  newEdu[eduIndex] = { ...newEdu[eduIndex], degree: v };
                  setData(prev => ({ ...prev, education: newEdu }));
                  setHasChanges(true);
                }}
                placeholder="Bachelor's, Master's, etc."
              />
              <EditableField
                label="Field of Study"
                value={edu.field || ''}
                onChange={(v) => {
                  const newEdu = [...data.education];
                  newEdu[eduIndex] = { ...newEdu[eduIndex], field: v };
                  setData(prev => ({ ...prev, education: newEdu }));
                  setHasChanges(true);
                }}
                placeholder="Computer Science, Business, etc."
              />
              <EditableField
                label="Graduation Year"
                value={edu.endDate || ''}
                onChange={(v) => {
                  const newEdu = [...data.education];
                  newEdu[eduIndex] = { ...newEdu[eduIndex], endDate: v };
                  setData(prev => ({ ...prev, education: newEdu }));
                  setHasChanges(true);
                }}
                placeholder="2020"
              />
                </div>
              </div>
              <button
                onClick={() => {
                  const newEdu = data.education.filter((_, i) => i !== eduIndex);
                  setData(prev => ({ ...prev, education: newEdu }));
                  setHasChanges(true);
                }}
                className="p-1 text-danger-muted hover:text-danger transition-colors cursor-pointer"
                title="Remove education"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => {
            const newEducation = {
              id: `edu-${Date.now()}`,
              institution: '',
              degree: '',
              field: '',
              endDate: '',
            };
            setData(prev => ({ ...prev, education: [...prev.education, newEducation] }));
            setHasChanges(true);
          }}
          className="flex items-center gap-1 text-xs text-brand hover:text-ink px-2 py-1 border border-dashed border-border-brand rounded cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          Add education
        </button>
      </section>

      {/* Certifications */}
      <section className={`mb-6 ${dim(sectionHidden('certifications'))}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand">
            Certifications
          </h3>
          <HideToggle hidden={sectionHidden('certifications')} onToggle={() => toggleSectionHidden('certifications')} label="this section" />
        </div>
        <div className="space-y-2">
          {data.certifications.map((cert, certIndex) => (
            <div key={cert.id || `cert-${certIndex}`} className={`flex items-center gap-2 p-2 bg-surface rounded border border-border group ${dim(cert.hidden)}`}>
              <HideToggle hidden={Boolean(cert.hidden)} onToggle={() => toggleEntryHidden('certifications', certIndex)} label="this certification" />
              <EditableField
                value={cert.name}
                onChange={(v) => {
                  const newCerts = [...data.certifications];
                  newCerts[certIndex] = { ...newCerts[certIndex], name: v };
                  setData(prev => ({ ...prev, certifications: newCerts }));
                  setHasChanges(true);
                }}
                placeholder="Certification name"
                className="flex-1"
              />
              <EditableField
                value={cert.issuer}
                onChange={(v) => {
                  const newCerts = [...data.certifications];
                  newCerts[certIndex] = { ...newCerts[certIndex], issuer: v };
                  setData(prev => ({ ...prev, certifications: newCerts }));
                  setHasChanges(true);
                }}
                placeholder="Issuer"
                className="text-sm text-ink-muted"
              />
              <EditableField
                value={cert.date || ''}
                onChange={(v) => {
                  const newCerts = [...data.certifications];
                  newCerts[certIndex] = { ...newCerts[certIndex], date: v };
                  setData(prev => ({ ...prev, certifications: newCerts }));
                  setHasChanges(true);
                }}
                placeholder="Date"
                className="text-sm text-ink-muted"
              />
              <button
                onClick={() => {
                  const newCerts = data.certifications.filter((_, i) => i !== certIndex);
                  setData(prev => ({ ...prev, certifications: newCerts }));
                  setHasChanges(true);
                }}
                className="p-1 text-danger-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Remove certification"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const newCert = {
                id: `cert-${Date.now()}`,
                name: '',
                issuer: '',
                date: '',
              };
              setData(prev => ({ ...prev, certifications: [...prev.certifications, newCert] }));
              setHasChanges(true);
            }}
            className="flex items-center gap-1 text-xs text-brand hover:text-ink px-2 py-1 border border-dashed border-border-brand rounded cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Add certification
          </button>
        </div>
      </section>

      {/* Additional Information */}
      <section className={`mb-6 ${dim(sectionHidden('additionalInfo'))}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand">
            Additional Information
          </h3>
          <HideToggle hidden={sectionHidden('additionalInfo')} onToggle={() => toggleSectionHidden('additionalInfo')} label="this section" />
        </div>
        <div className="space-y-2">
          {(data.additionalInfo || []).map((item, itemIndex) => (
            <div key={`addl-${itemIndex}`} className="flex items-start gap-2 group">
              <span className="text-ink-muted mt-2">•</span>
              <EditableField
                value={item}
                onChange={(v) => {
                  const newInfo = [...(data.additionalInfo || [])];
                  newInfo[itemIndex] = v;
                  setData(prev => ({ ...prev, additionalInfo: newInfo }));
                  setHasChanges(true);
                }}
                placeholder="e.g., Work authorization, volunteer work, awards, interests..."
                className="flex-1 text-sm"
              />
              <button
                onClick={() => {
                  const newInfo = (data.additionalInfo || []).filter((_, i) => i !== itemIndex);
                  setData(prev => ({ ...prev, additionalInfo: newInfo.length > 0 ? newInfo : undefined }));
                  setHasChanges(true);
                }}
                className="p-1 text-danger-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Remove item"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              setData(prev => ({ ...prev, additionalInfo: [...(prev.additionalInfo || []), ''] }));
              setHasChanges(true);
            }}
            className="flex items-center gap-1 text-xs text-brand hover:text-ink px-2 py-1 border border-dashed border-border-brand rounded cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Add item
          </button>
        </div>
      </section>

      {/* Custom Sections (achievements, references, volunteer, publications, etc.) */}
      {(data.customSections || []).map((section, secIndex) => (
        <section key={section.id || `custom-${secIndex}`} className={`mb-6 ${dim(section.hidden)}`}>
          <div className="flex items-center justify-between mb-3">
            <EditableField
              value={section.title}
              onChange={(v) => {
                const newSections = [...(data.customSections || [])];
                newSections[secIndex] = { ...newSections[secIndex], title: v };
                setData(prev => ({ ...prev, customSections: newSections }));
                setHasChanges(true);
              }}
              placeholder="Section title"
              className="text-sm font-bold uppercase tracking-wider text-brand"
            />
            <HideToggle hidden={Boolean(section.hidden)} onToggle={() => toggleEntryHidden('customSections', secIndex)} label="this section" />
            <button
              onClick={() => {
                const newSections = (data.customSections || []).filter((_, i) => i !== secIndex);
                setData(prev => ({ ...prev, customSections: newSections.length > 0 ? newSections : undefined }));
                setHasChanges(true);
              }}
              className="p-1 text-danger-muted hover:text-danger cursor-pointer"
              title="Remove section"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1">
            {section.items.map((item, itemIndex) => (
              <div key={itemIndex} className="flex items-start gap-2 group">
                <span className="text-ink-muted mt-2">•</span>
                <EditableField
                  value={item}
                  onChange={(v) => {
                    const newSections = [...(data.customSections || [])];
                    const newItems = [...newSections[secIndex].items];
                    newItems[itemIndex] = v;
                    newSections[secIndex] = { ...newSections[secIndex], items: newItems };
                    setData(prev => ({ ...prev, customSections: newSections }));
                    setHasChanges(true);
                  }}
                  placeholder="Item..."
                  className="flex-1 text-sm"
                />
                <button
                  onClick={() => {
                    const newSections = [...(data.customSections || [])];
                    newSections[secIndex] = {
                      ...newSections[secIndex],
                      items: newSections[secIndex].items.filter((_, i) => i !== itemIndex),
                    };
                    setData(prev => ({ ...prev, customSections: newSections }));
                    setHasChanges(true);
                  }}
                  className="p-1 text-danger-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title="Remove item"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                const newSections = [...(data.customSections || [])];
                newSections[secIndex] = {
                  ...newSections[secIndex],
                  items: [...newSections[secIndex].items, ''],
                };
                setData(prev => ({ ...prev, customSections: newSections }));
                setHasChanges(true);
              }}
              className="flex items-center gap-1 text-xs text-brand hover:text-ink mt-2 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              Add item
            </button>
          </div>
        </section>
      ))}
      <button
        onClick={() => {
          const newSection = {
            id: `custom-${Date.now()}`,
            title: '',
            items: [''],
          };
          setData(prev => ({ ...prev, customSections: [...(prev.customSections || []), newSection] }));
          setHasChanges(true);
        }}
        className="flex items-center gap-1 text-xs text-brand hover:text-ink px-2 py-1 border border-dashed border-border-brand rounded cursor-pointer mb-6"
      >
        <Plus className="w-3 h-3" />
        Add custom section
      </button>

      {/* Languages */}
      <section className={` ${dim(sectionHidden('languages'))}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand">
            Languages
          </h3>
          <HideToggle hidden={sectionHidden('languages')} onToggle={() => toggleSectionHidden('languages')} label="this section" />
        </div>
        <div className="flex flex-wrap gap-2">
          {data.languages.map((lang, langIndex) => (
            <div key={`lang-${langIndex}`} className={`flex items-center gap-2 bg-canvas rounded px-3 py-1 group ${dim(lang.hidden)}`}>
              <HideToggle hidden={Boolean(lang.hidden)} onToggle={() => toggleEntryHidden('languages', langIndex)} label="this language" />
              <EditableField
                value={lang.language}
                onChange={(v) => {
                  const newLangs = [...data.languages];
                  newLangs[langIndex] = { ...newLangs[langIndex], language: v };
                  setData(prev => ({ ...prev, languages: newLangs }));
                  setHasChanges(true);
                }}
                className="font-medium text-sm"
              />
              <span className="text-ink-muted">-</span>
              <EditableField
                value={lang.proficiency}
                onChange={(v) => {
                  const newLangs = [...data.languages];
                  newLangs[langIndex] = { ...newLangs[langIndex], proficiency: v };
                  setData(prev => ({ ...prev, languages: newLangs }));
                  setHasChanges(true);
                }}
                className="text-sm text-ink-muted"
              />
              <button
                onClick={() => {
                  const newLangs = data.languages.filter((_, i) => i !== langIndex);
                  setData(prev => ({ ...prev, languages: newLangs }));
                  setHasChanges(true);
                }}
                className="p-1 text-danger-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Remove language"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const newLang = { language: '', proficiency: '' };
              setData(prev => ({ ...prev, languages: [...prev.languages, newLang] }));
              setHasChanges(true);
            }}
            className="flex items-center gap-1 text-xs text-brand hover:text-ink px-2 py-1 border border-dashed border-border-brand rounded cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Add language
          </button>
        </div>
      </section>
    </div>
  );
});

EditableCVCanvas.displayName = 'EditableCVCanvas';
