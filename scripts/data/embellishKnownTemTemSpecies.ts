import path from 'path';
import cheerio from 'cheerio';
import * as log from '../util/log';
import write from '../util/write';
import fetchHTML from '../util/fetchHTML';

export default async function embellishKnownTemTemSpecies (ar: any) {
  log.info(`Embellishing ${ar.length} tems`);
  const webpages = await fetchHTML('temtem', ar, 'name', true);
  const result = webpages.map(({item, html}) => {
    return {
      ...item,
      traits: getTraits(html),
      details: getDetails(html),
      techniques: getTechniques(html),
      trivia: getTrivia(html),
      evolution: getEvolutionInfo(ar, item, html),
      wikiPortraitUrlLarge: getWikiPortraitUrl(html),
      icon: `/images/portraits/temtem/large/${item.name}.png`
    };
  }).sort((a, b) => a.number - b.number);
  await write('knownTemTemSpecies', result);
}

function getWikiPortraitUrl(html: string) {
  const $ = cheerio.load(html);
  return $('#mw-content-text .infobox-table img').first().attr('src');
}

function getTraits (html: string) {
  const $ = cheerio.load(html);
  const $traitInfo = $('.infobox-row').filter((_i, el) => {
    return !!$(el).text().includes('Traits');
  }).first().find('.infobox-row-value').last();
  return $traitInfo.find('a').map((_i, el) => $(el).text().trim()).toArray();
}

function getDetails (html: string) {
  const $ = cheerio.load(html);
  const heightInfo = $('.infobox-row').filter((_i, el) => {
    return !!$(el).text().includes('Height');
  }).first().find('.infobox-row-value').last().text();
  const weightInfo = $('.infobox-row').filter((_i, el) => {
    return !!$(el).text().includes('Weight');
  }).first().find('.infobox-row-value').last().text();
  return {
    height: {
      cm: getDetailSafely(heightInfo, 'cm', 0),
      inches: getDetailSafely(heightInfo, '"', 1),
    },
    weight: {
      kg: getDetailSafely(weightInfo, 'kg', 0),
      lbs: getDetailSafely(weightInfo, 'lbs', 1),
    }
  }
}

function getDetailSafely (str: string, key: string, i: number) {
  if (!str.includes(key)) return '?';
  try {
    return parseInt(str.split('/')[i], 10)
  } catch {
    return '?';
  }
}

function getTechniques (html: string) {
  return [];
}

function getTrivia (html: string) {
  const $ = cheerio.load(html);
  const trivia = $('#Trivia').parent().next().find('li').map((_i, el) => $(el).text().replace(/\[.\]/g, '').replace(/\\/g, '').trim()).toArray();
  return trivia;
}

function getEvolutionInfo (items: any[], item: any, html: string) {
  const $ = cheerio.load(html);
  const $evolutionHeader = $('#Evolution');
  if ($evolutionHeader.length) {
    let $evolutionTable = $evolutionHeader.parent().next();
    if (!$evolutionTable.is('table')) {
      $evolutionTable = $evolutionTable.next();
      if (!$evolutionTable.is('table')) {
        $evolutionTable = $evolutionTable.next();
        if (!$evolutionTable.is('table')) {
          if (item.name === 'Tuwai' || item.name === 'Tuvine') {
            return {
              stage: item.name === 'Tuwai' ? 1 : 2,
              evolutionTree: [],
              evolves: true,
              type: 'special',
              description: 'Tuwai can evolve into Tuvine by taking one to the Crystal Shrine, and selecting it. This requires that you beat the Cultist Hunt side-quest.'
            }
          }
          log.warn('Gave up on evolution table for', item.name);
          return {};
        }
      }
    }
    const evolutionParts: (string | number)[] = [];
    $evolutionTable.find('tbody>tr>td').each((i, el) => {
      const text = $(el).text().trim();
      if (text.includes('Levels') || $(el).children('a').length && text !== '' && text !== '100x100px') {
        evolutionParts.push(isNaN(parseInt(text, 10)) ? text : parseInt(text, 10));
      }
    });
    if (item.name === 'Zaobian') {
      evolutionParts.splice(0, 2);
    }
    const evolutionTree = evolutionParts.reduce<any>((prev, cur) => {
      if (typeof cur === 'string' && !cur.includes('Levels')) {
        const evoItem = items.find(({name}) => name === cur);
        prev.push({
          number: evoItem ? evoItem.number : -1,
          name: cur,
          stage: Number(prev.length) + 1
        })
      } else if (prev.length) {
        prev[prev.length - 1].levels = cur
      }
      return prev;
    }, []);
    return {
      stage: Number(evolutionTree.findIndex(({name}) => item.name === name)) + 1,
      evolutionTree,
      evolves: true,
      type: 'level'
    }
  } else {
    return {
      evolves: false
    };
  }
}